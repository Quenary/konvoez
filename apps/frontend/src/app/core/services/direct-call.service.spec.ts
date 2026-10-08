import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
    class AudioWorkletNode {};
});

import {
  EDirectCallEvent,
  EUserRole,
  EVoiceSessionType,
  IUser,
} from '@konvoez/shared';
import { DirectCallService, ECallStatus } from './direct-call.service';
import { VoiceRoomSocketToken } from '../tokens/voice-room-socket.token';
import { AudioService } from './audio.service';
import { Subject } from 'rxjs';
import { VoiceSessionService } from './voice-session.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { TuiNotificationService } from '@taiga-ui/core';
import { TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';

const caller = {
  id: 1,
  username: 'alice',
  fullname: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

const recipient = {
  id: 2,
  username: 'bob',
  fullname: 'Bob',
  email: 'bob@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

describe('DirectCallService', () => {
  let service: DirectCallService;
  let socket: {
    on: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    emitWithAck: ReturnType<typeof vi.fn>;
    timeout: ReturnType<typeof vi.fn>;
    connected: boolean;
  };
  let voiceSessionService: {
    joinSession: ReturnType<typeof vi.fn>;
    leaveSession: ReturnType<typeof vi.fn>;
    reportJoinFailure: ReturnType<typeof vi.fn>;
    sessionWillChange$: Subject<{
      previous: unknown;
      next: unknown;
    }>;
  };
  let notifications: { open: ReturnType<typeof vi.fn> };
  let voiceSessionStore: {
    directCallTarget: ReturnType<typeof vi.fn>;
    activeSession: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let handlers: Record<string, (...args: unknown[]) => unknown>;
  let audioService: {
    startIncomingRingtone: ReturnType<typeof vi.fn>;
    stopIncomingRingtone: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    handlers = {};
    socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      }),
      emit: vi.fn(),
      emitWithAck: vi.fn().mockResolvedValue(null),
      timeout: vi.fn(),
      connected: false,
    };
    socket.timeout.mockReturnValue(socket);

    voiceSessionService = {
      joinSession: vi.fn().mockResolvedValue(undefined),
      leaveSession: vi.fn().mockResolvedValue(undefined),
      reportJoinFailure: vi.fn(),
      sessionWillChange$: new Subject(),
    };
    notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    };
    voiceSessionStore = {
      directCallTarget: vi.fn().mockReturnValue(null),
      activeSession: vi.fn().mockReturnValue(null),
    };

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };
    audioService = {
      startIncomingRingtone: vi.fn(),
      stopIncomingRingtone: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        DirectCallService,
        { provide: VoiceRoomSocketToken, useValue: socket },
        {
          provide: AudioService,
          useValue: {
            startOutgoingDialing: vi.fn(),
            stopOutgoingDialing: vi.fn(),
            playCallEndSound: vi.fn(),
            ...audioService,
          },
        },
        { provide: VoiceSessionService, useValue: voiceSessionService },
        { provide: VoiceSessionStore, useValue: voiceSessionStore },
        { provide: Router, useValue: router },
        { provide: TuiNotificationService, useValue: notifications },
        {
          provide: TranslateService,
          useValue: { instant: vi.fn((key: string) => key) },
        },
        {
          provide: Store,
          useValue: {
            selectSignal: () => () => caller,
          },
        },
      ],
    });

    service = TestBed.inject(DirectCallService);
  });

  it('isRinging is true while calling or incoming', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CALLING,
    });
    expect(service.isRinging()).toBe(true);

    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: caller,
      isCaller: false,
      status: ECallStatus.INCOMING,
    });
    expect(service.isRinging()).toBe(true);
    expect(service.isDirectCallContext()).toBe(true);
  });

  it('acceptCall clears the call when the server rejects accept', async () => {
    socket.emitWithAck.mockResolvedValue({
      error: 'Call not found or already ended',
    });
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: caller,
      isCaller: false,
      status: ECallStatus.INCOMING,
    });

    await service.acceptCall();

    expect(service.activeCall()).toBeNull();
    expect(audioService.startIncomingRingtone).not.toHaveBeenCalled();
    expect(notifications.open).toHaveBeenCalledWith(
      'CALL.ACCEPT_FAILED',
      expect.objectContaining({ appearance: 'negative' }),
    );
    expect(voiceSessionService.joinSession).not.toHaveBeenCalled();
  });

  it('acceptCall reports join failure and hangs up when media join fails', async () => {
    socket.emitWithAck.mockResolvedValue(undefined);
    voiceSessionService.joinSession.mockRejectedValue(new Error('join failed'));
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: caller,
      isCaller: false,
      status: ECallStatus.INCOMING,
    });

    await service.acceptCall();

    expect(voiceSessionService.reportJoinFailure).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(EDirectCallEvent.CALL_HANGUP, {
      callId: 'c1',
      byUserId: caller.id,
    });
    expect(service.activeCall()).toBeNull();
  });

  it('acceptCall on ack timeout rejoins call, navigates, and clears rejoinable call', async () => {
    socket.emitWithAck
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce({
        callId: 'c1',
        callerId: recipient.id,
        recipientId: caller.id,
      });

    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: false,
      status: ECallStatus.INCOMING,
    });

    await service.acceptCall();

    expect(voiceSessionService.joinSession).toHaveBeenCalledWith({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });
    expect(router.navigate).toHaveBeenCalledWith(['/direct', recipient.id]);
    expect(service.rejoinableCall()).toBeNull();
    expect(service.activeCall()?.status).toBe(ECallStatus.CONNECTED);
  });

  it('acceptCall on ack timeout emits CALL_REJECT and shows toast when re-query returns null', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    socket.emitWithAck
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce(null);

    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: false,
      status: ECallStatus.INCOMING,
    });

    await service.acceptCall();

    expect(socket.emit).toHaveBeenCalledWith(EDirectCallEvent.CALL_REJECT, {
      callId: 'c1',
      callerId: recipient.id,
      reason: 'declined',
    });
    expect(service.activeCall()).toBeNull();
    expect(notifications.open).toHaveBeenCalledWith(
      'CALL.ACCEPT_FAILED',
      expect.objectContaining({ appearance: 'negative' }),
    );
    expect(voiceSessionService.joinSession).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('callWithUserId prefers the media session interlocutor', () => {
    voiceSessionStore.activeSession.mockReturnValue({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });

    expect(service.callWithUserId()).toBe(recipient.id);
  });

  it('callWithUserId falls back to signaling interlocutor', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CALLING,
    });

    expect(service.callWithUserId()).toBe(recipient.id);
  });

  it('hangingCallUserId ignores incoming calls and uses rejoinable peer', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: false,
      status: ECallStatus.INCOMING,
    });
    service['_rejoinableCall'].set({
      callId: 'c2',
      callerId: recipient.id,
      recipientId: caller.id,
    });

    expect(service.hangingCallUserId()).toBe(recipient.id);
  });

  it('cancelCall emits hangup for ringing caller and does not leave media', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CALLING,
    });

    service.cancelCall();

    expect(socket.emit).toHaveBeenCalledWith(EDirectCallEvent.CALL_HANGUP, {
      callId: 'c1',
      byUserId: caller.id,
    });
    expect(voiceSessionService.leaveSession).not.toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
  });

  it('leaveCall leaves media without emitting hangup when connected', async () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });
    voiceSessionStore.directCallTarget.mockReturnValue({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });

    await service.leaveCall();

    expect(socket.emit).not.toHaveBeenCalledWith(
      EDirectCallEvent.CALL_HANGUP,
      expect.anything(),
    );
    expect(voiceSessionService.leaveSession).toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
    expect(service.rejoinableCall()?.callId).toBe('c1');
  });

  it('leaveCall clears rejoinable when CALL_ENDED arrives during leave', async () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });
    voiceSessionStore.directCallTarget.mockReturnValue({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });
    voiceSessionService.leaveSession.mockImplementation(async () => {
      handlers[EDirectCallEvent.CALL_ENDED]({ callId: 'c1' });
    });

    await service.leaveCall();

    expect(service.activeCall()).toBeNull();
    expect(service.rejoinableCall()).toBeNull();
  });

  it('leaveCall cancels a ringing call', async () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CALLING,
    });

    await service.leaveCall();

    expect(socket.emit).toHaveBeenCalledWith(EDirectCallEvent.CALL_HANGUP, {
      callId: 'c1',
      byUserId: caller.id,
    });
    expect(voiceSessionService.leaveSession).not.toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
  });

  it('CALL_ENDED clears local call state', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });
    voiceSessionStore.directCallTarget.mockReturnValue({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: recipient.id,
    });

    handlers[EDirectCallEvent.CALL_ENDED]({ callId: 'c1' });

    expect(service.activeCall()).toBeNull();
    expect(voiceSessionService.leaveSession).toHaveBeenCalled();
  });

  it('detachFromCallWithoutHangup does not emit hangup for connected call', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });

    service.detachFromCallWithoutHangup();

    expect(socket.emit).not.toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
    expect(service.rejoinableCall()?.callId).toBe('c1');
  });

  it('detaches from a connected call when joining a group voice session', () => {
    service['_activeCall'].set({
      callId: 'c1',
      interlocutor: recipient,
      isCaller: true,
      status: ECallStatus.CONNECTED,
    });

    voiceSessionService.sessionWillChange$.next({
      previous: {
        type: EVoiceSessionType.DIRECT_CALL,
        callId: 'c1',
        interlocutorId: recipient.id,
      },
      next: {
        type: EVoiceSessionType.GROUP_ROOM,
        roomId: 7,
      },
    });

    expect(socket.emit).not.toHaveBeenCalled();
    expect(service.activeCall()).toBeNull();
    expect(service.rejoinableCall()?.callId).toBe('c1');
  });
});
