import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  EDirectCallEvent,
  EVoiceSessionType,
  ICallAcceptedPayload,
  ICallEndedPayload,
  ICallGetActiveResult,
  ICallHangupPayload,
  ICallIncomingPayload,
  ICallInitiatePayload,
  ICallInitiateResult,
  ICallRejectedPayload,
  IUser,
  TVoiceSessionTarget,
} from '@konvoez/shared';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import {
  emitVoiceRoomWithAck,
  isVoiceSocketAckTimeout,
} from './voice-room-socket-ack';
import { AudioService } from './audio.service';
import { VoiceSessionService } from './voice-session.service';
import { TuiNotificationService } from '@taiga-ui/core';
import { TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { notifyError } from '@shared/functions/notify-error.function';

export enum ECallStatus {
  IDLE = 'IDLE',
  CALLING = 'CALLING',
  INCOMING = 'INCOMING',
  CONNECTED = 'CONNECTED',
}

export interface IActiveCall {
  callId: string;
  interlocutor: IUser;
  isCaller: boolean;
  status: ECallStatus;
}

/**
 * Direct-call signaling and ringing state. Media join/leave goes through VoiceSessionService.
 * Detaches from a live call without hangup when the voice session switches away.
 */
@Injectable({
  providedIn: 'root',
})
export class DirectCallService {
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly audioService = inject(AudioService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly notificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly store = inject(Store);
  private readonly router = inject(Router);

  private readonly _activeCall = signal<IActiveCall | null>(null);
  private readonly _rejoinableCall = signal<ICallGetActiveResult | null>(null);

  public readonly activeCall = this._activeCall.asReadonly();
  public readonly rejoinableCall = this._rejoinableCall.asReadonly();
  public readonly callStatus = computed(
    () => this._activeCall()?.status ?? ECallStatus.IDLE,
  );
  public readonly isCallActive = computed(
    () => this.callStatus() !== ECallStatus.IDLE,
  );
  public readonly isCalling = computed(
    () => this.callStatus() === ECallStatus.CALLING,
  );
  public readonly isIncoming = computed(
    () => this.callStatus() === ECallStatus.INCOMING,
  );
  public readonly isConnected = computed(
    () => this.callStatus() === ECallStatus.CONNECTED,
  );
  /** Outgoing or incoming ring before media is connected. */
  public readonly isRinging = computed(
    () => this.isCalling() || this.isIncoming(),
  );
  public readonly interlocutor = computed(
    () => this._activeCall()?.interlocutor ?? null,
  );

  /** User id for an in-progress or connected direct call (media session or signaling). */
  public readonly callWithUserId = computed(() => {
    const session = this.voiceSessionStore.activeSession();
    const callActive = this.isCallActive();
    const signalingInterlocutorId = this.interlocutor()?.id ?? null;

    if (session?.type === EVoiceSessionType.DIRECT_CALL) {
      return session.interlocutorId;
    }
    if (!callActive) {
      return null;
    }
    return signalingInterlocutorId;
  });

  /** Sidebar / aside entry for an ongoing or rejoinable direct call. */
  public readonly hangingCallUserId = computed(() => {
    const active = this._activeCall();
    const rejoinable = this._rejoinableCall();
    const me = this.currentUser();

    if (
      active &&
      (active.status === ECallStatus.CONNECTED ||
        active.status === ECallStatus.CALLING)
    ) {
      return active.interlocutor.id;
    }

    if (!rejoinable || !me) {
      return null;
    }

    return rejoinable.callerId === me.id
      ? rejoinable.recipientId
      : rejoinable.callerId;
  });

  /** Direct-call UI (shell/grid) for media or ringing signaling. */
  public readonly isDirectCallContext = computed(() => {
    const session = this.voiceSessionStore.activeSession();
    return session?.type === EVoiceSessionType.DIRECT_CALL || this.isRinging();
  });

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private timeoutRef: ReturnType<typeof setTimeout> | null = null;
  private accepting = false;

  constructor() {
    this.setupSocketListeners();

    this.voiceSessionService.sessionWillChange$.subscribe(
      ({ previous, next }) => {
        this.detachIfLeavingCall(previous, next);
      },
    );

    this.socket.on('connect', () => {
      void this.refreshActiveCall();
    });
    if (this.socket.connected) {
      void this.refreshActiveCall();
    }
  }

  public async initiateCall(recipient: IUser): Promise<void> {
    if (this._activeCall()) {
      return;
    }

    try {
      this.audioService.startOutgoingDialing();

      const result: ICallInitiateResult = await emitVoiceRoomWithAck(
        this.socket,
        EDirectCallEvent.CALL_INITIATE,
        {
          recipientId: recipient.id,
        } satisfies ICallInitiatePayload,
      );

      if (result.alreadyActive) {
        this.audioService.stopOutgoingDialing();
        await this.rejoinCall(
          {
            callId: result.callId,
            callerId: this.currentUser()?.id ?? 0,
            recipientId: recipient.id,
          },
          recipient,
        );
        return;
      }

      this._activeCall.set({
        callId: result.callId,
        interlocutor: recipient,
        isCaller: true,
        status: ECallStatus.CALLING,
      });
      this._rejoinableCall.set(null);

      this.timeoutRef = setTimeout(() => {
        if (this.isCalling()) {
          this.cancelCall();
          this.notificationsService
            .open(this.translateService.instant('CALL.NO_ANSWER'), {
              appearance: 'warning',
              autoClose: 4000,
            })
            .subscribe();
        }
      }, 45000);
    } catch (err) {
      this.audioService.stopOutgoingDialing();
      this._activeCall.set(null);
      notifyError(
        this.notificationsService,
        this.translateService,
        'CALL.INITIATE_FAILED',
        err,
      );
    }
  }

  public async acceptCall(): Promise<void> {
    if (this.accepting) {
      return;
    }
    const current = this._activeCall();
    if (!current || current.status !== ECallStatus.INCOMING) {
      return;
    }

    this.accepting = true;
    this.audioService.stopIncomingRingtone();

    try {
      try {
        await emitVoiceRoomWithAck(this.socket, EDirectCallEvent.CALL_ACCEPT, {
          callId: current.callId,
          callerId: current.interlocutor.id,
        });
      } catch (error) {
        if (isVoiceSocketAckTimeout(error)) {
          const active = await this.refreshActiveCall(current.interlocutor.id);
          if (active?.callId === current.callId) {
            this._rejoinableCall.set(null);
            await this.joinAcceptedCall(current);
            return;
          }

          this.socket.emit(EDirectCallEvent.CALL_REJECT, {
            callId: current.callId,
            callerId: current.interlocutor.id,
            reason: 'failed',
          });
        }

        this._activeCall.set(null);
        this.notificationsService
          .open(this.translateService.instant('CALL.ACCEPT_FAILED'), {
            appearance: 'negative',
            autoClose: 5000,
          })
          .subscribe();
        console.error('Failed to accept direct call', error);
        return;
      }

      await this.joinAcceptedCall(current);
    } finally {
      this.accepting = false;
    }
  }

  private async joinAcceptedCall(current: IActiveCall): Promise<void> {
    this._activeCall.set({
      ...current,
      status: ECallStatus.CONNECTED,
    });

    try {
      await this.voiceSessionService.joinSession({
        type: EVoiceSessionType.DIRECT_CALL,
        callId: current.callId,
        interlocutorId: current.interlocutor.id,
      });
      await this.router.navigate(['/direct', current.interlocutor.id]);
    } catch (joinError) {
      this.voiceSessionService.reportJoinFailure(joinError);
      const me = this.currentUser();
      if (me) {
        this.socket.emit(EDirectCallEvent.CALL_HANGUP, {
          callId: current.callId,
          byUserId: me.id,
        });
      }
      this._activeCall.set(null);
    }
  }

  public rejectCall(): void {
    const current = this._activeCall();
    if (!current || current.status !== ECallStatus.INCOMING) {
      return;
    }

    this.audioService.stopIncomingRingtone();

    this.socket.emit(EDirectCallEvent.CALL_REJECT, {
      callId: current.callId,
      callerId: current.interlocutor.id,
      reason: 'declined',
    });

    this._activeCall.set(null);
  }

  /**
   * Cancel a ringing call (calling / incoming). Ends the call for both sides.
   */
  public cancelCall(): void {
    const current = this._activeCall();
    if (!current) {
      return;
    }

    if (
      current.status !== ECallStatus.CALLING &&
      current.status !== ECallStatus.INCOMING
    ) {
      return;
    }

    const me = this.currentUser();
    this.clearCallTimeout();
    this.audioService.stopOutgoingDialing();
    this.audioService.stopIncomingRingtone();
    this.audioService.playCallEndSound();

    if (current.status === ECallStatus.INCOMING) {
      this.socket.emit(EDirectCallEvent.CALL_REJECT, {
        callId: current.callId,
        callerId: current.interlocutor.id,
        reason: 'declined',
      });
    } else if (me) {
      this.socket.emit(EDirectCallEvent.CALL_HANGUP, {
        callId: current.callId,
        byUserId: me.id,
      });
    }

    this._activeCall.set(null);
  }

  /**
   * Leave the current call:
   * - ringing (calling/incoming) → cancel for both sides
   * - connected → leave media without ending the call for the other participant
   */
  public async leaveCall(): Promise<void> {
    const current = this._activeCall();
    if (!current) {
      return;
    }

    if (
      current.status === ECallStatus.CALLING ||
      current.status === ECallStatus.INCOMING
    ) {
      this.cancelCall();
      return;
    }

    if (current.status !== ECallStatus.CONNECTED) {
      return;
    }

    this.clearCallTimeout();
    this.audioService.playCallEndSound();

    // Mark rejoinable before leaving media so CALL_ENDED (last peer) can clear it.
    // Setting this after leaveSession races: the event arrives during leave, then
    // we overwrite and keep a stale rejoin icon.
    this._rejoinableCall.set({
      callId: current.callId,
      callerId: current.isCaller
        ? (this.currentUser()?.id ?? 0)
        : current.interlocutor.id,
      recipientId: current.isCaller
        ? current.interlocutor.id
        : (this.currentUser()?.id ?? 0),
    });
    this._activeCall.set(null);

    if (this.voiceSessionStore.directCallTarget()) {
      await this.voiceSessionService.leaveSession();
    }
  }

  public async refreshActiveCall(
    interlocutorId?: number,
  ): Promise<ICallGetActiveResult | null> {
    try {
      const result: ICallGetActiveResult | null = await emitVoiceRoomWithAck(
        this.socket,
        EDirectCallEvent.CALL_GET_ACTIVE,
        interlocutorId !== undefined ? { interlocutorId } : {},
      );

      const inThisCall =
        this._activeCall()?.callId === result?.callId &&
        this.voiceSessionStore.directCallTarget()?.callId === result?.callId;

      if (result && !inThisCall) {
        this._rejoinableCall.set(result);
      } else if (!result) {
        this._rejoinableCall.set(null);
      }

      return result;
    } catch (err) {
      console.error('Failed to query active direct call', err);
      return null;
    }
  }

  public async rejoinCall(
    call: ICallGetActiveResult,
    interlocutor: IUser,
  ): Promise<void> {
    const me = this.currentUser();
    if (!me) {
      return;
    }

    this._activeCall.set({
      callId: call.callId,
      interlocutor,
      isCaller: call.callerId === me.id,
      status: ECallStatus.CONNECTED,
    });
    this._rejoinableCall.set(null);

    await this.voiceSessionService.joinSession({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: call.callId,
      interlocutorId: interlocutor.id,
    });
  }

  /**
   * Clear local call participation when switching to another voice session
   * (e.g. joining a group room). Does not hang up the remote party.
   */
  public detachFromCallWithoutHangup(): void {
    const current = this._activeCall();
    if (!current) {
      return;
    }

    if (
      current.status === ECallStatus.CALLING ||
      current.status === ECallStatus.INCOMING
    ) {
      this.cancelCall();
      return;
    }

    this.clearCallTimeout();
    this._activeCall.set(null);
    this._rejoinableCall.set({
      callId: current.callId,
      callerId: current.isCaller
        ? (this.currentUser()?.id ?? 0)
        : current.interlocutor.id,
      recipientId: current.isCaller
        ? current.interlocutor.id
        : (this.currentUser()?.id ?? 0),
    });
  }

  private detachIfLeavingCall(
    previous: TVoiceSessionTarget | null,
    next: TVoiceSessionTarget,
  ): void {
    const leavingDirectCall =
      previous?.type === EVoiceSessionType.DIRECT_CALL &&
      (next.type !== EVoiceSessionType.DIRECT_CALL ||
        next.callId !== previous.callId);
    const joiningGroupWhileInCall =
      next.type === EVoiceSessionType.GROUP_ROOM && this.isConnected();

    if (leavingDirectCall || joiningGroupWhileInCall) {
      this.detachFromCallWithoutHangup();
    }
  }

  private setupSocketListeners(): void {
    this.socket.on(
      EDirectCallEvent.CALL_INCOMING,
      (data: ICallIncomingPayload) => {
        const current = this._activeCall();
        if (current && current.status !== ECallStatus.IDLE) {
          this.socket.emit(EDirectCallEvent.CALL_REJECT, {
            callId: data.callId,
            callerId: data.caller.id,
            reason: 'busy',
          });
          return;
        }

        this._activeCall.set({
          callId: data.callId,
          interlocutor: data.caller,
          isCaller: false,
          status: ECallStatus.INCOMING,
        });
        this._rejoinableCall.set(null);

        this.audioService.startIncomingRingtone();
      },
    );

    this.socket.on(
      EDirectCallEvent.CALL_ACCEPTED,
      async (data: ICallAcceptedPayload) => {
        const current = this._activeCall();
        if (!current || current.callId !== data.callId) {
          return;
        }

        this.clearCallTimeout();
        this.audioService.stopOutgoingDialing();

        this._activeCall.set({
          ...current,
          interlocutor: data.recipient,
          status: ECallStatus.CONNECTED,
        });

        await this.voiceSessionService.joinSession({
          type: EVoiceSessionType.DIRECT_CALL,
          callId: data.callId,
          interlocutorId: data.recipient.id,
        });

        await this.router.navigate(['/direct', data.recipient.id]);
      },
    );

    this.socket.on(
      EDirectCallEvent.CALL_REJECTED,
      (data: ICallRejectedPayload) => {
        const current = this._activeCall();
        if (!current || current.callId !== data.callId) {
          return;
        }

        this.clearCallTimeout();
        this.audioService.stopOutgoingDialing();
        this.audioService.playCallEndSound();
        this._activeCall.set(null);

        const reasonText =
          data.reason === 'busy'
            ? this.translateService.instant('CALL.BUSY')
            : data.reason === 'failed'
              ? this.translateService.instant('CALL.CALL_FAILED')
              : this.translateService.instant('CALL.DECLINED');

        this.notificationsService
          .open(reasonText, {
            appearance: 'warning',
            autoClose: 4000,
          })
          .subscribe();
      },
    );

    this.socket.on(EDirectCallEvent.CALL_HANGUP, (data: ICallHangupPayload) => {
      const current = this._activeCall();
      if (!current || current.callId !== data.callId) {
        return;
      }

      this.clearCallTimeout();
      this.audioService.stopOutgoingDialing();
      this.audioService.stopIncomingRingtone();
      this.audioService.playCallEndSound();
      this._activeCall.set(null);
      this._rejoinableCall.set(null);
    });

    this.socket.on(EDirectCallEvent.CALL_ENDED, (data: ICallEndedPayload) => {
      const current = this._activeCall();

      if (current?.callId === data.callId) {
        this.clearCallTimeout();
        this.audioService.stopOutgoingDialing();
        this.audioService.stopIncomingRingtone();
        this.audioService.playCallEndSound();
        this._activeCall.set(null);

        if (this.voiceSessionStore.directCallTarget()?.callId === data.callId) {
          void this.voiceSessionService.leaveSession();
        }
      }

      if (this._rejoinableCall()?.callId === data.callId) {
        this._rejoinableCall.set(null);
      }
    });
  }

  private clearCallTimeout(): void {
    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }
  }
}
