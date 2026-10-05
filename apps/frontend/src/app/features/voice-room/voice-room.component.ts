import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { map } from 'rxjs';
import { selectRoomsDict } from '../rooms/rooms.selectors';
import { IRoom } from '../rooms/rooms.interface';
import { VoicePeersGridComponent } from '@shared/components/voice-room/voice-peers-grid/voice-peers-grid.component';
import { VoiceRoomOverlayComponent } from '@shared/components/voice-room/voice-room-overlay/voice-room-overlay.component';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { resolveVoiceSessionPeers } from '@shared/components/voice-room/voice-session-peers';
import { VoiceRoomViewService } from '@shared/components/voice-room/voice-room-view.service';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { DirectCallService } from '@core/services/direct-call.service';
import { EVoiceSessionType } from '@konvoez/shared';

@Component({
  selector: 'app-voice-room',
  host: {
    '(pointermove)': 'revealChrome()',
    '(pointerdown)': 'revealChrome()',
  },
  imports: [VoicePeersGridComponent, VoiceRoomOverlayComponent],
  templateUrl: './voice-room.component.html',
  styleUrl: './voice-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly directCallService = inject(DirectCallService);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  /**
   * Tracks which route room id we already attempted to join, so leaving
   * while staying on the page does not immediately re-join.
   */
  private readonly joinedForRoomId = signal<number | null>(null);

  protected readonly room = computed((): IRoom | null => {
    const id = this.roomId();
    const roomsDict = this.roomsDict();
    if (!id) {
      return null;
    }
    return roomsDict[id] ?? null;
  });

  protected readonly participantsCount = computed(() => {
    const isCalling = this.directCallService.isCalling();
    const isIncoming = this.directCallService.isIncoming();
    return resolveVoiceSessionPeers({
      me: this.currentUser(),
      remotePeers: this.voiceRoomStore.peersList(),
      session: this.voiceRoomStore.activeSession(),
      isRinging: isCalling || isIncoming,
      interlocutor: this.directCallService.interlocutor(),
    }).length;
  });

  private readonly roomsDict = this.store.selectSignal(selectRoomsDict);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('id')))),
  );

  constructor() {
    this.voiceRoomViewService.attachHost(this.host.nativeElement);
    this.voiceRoomViewService.revealChrome();
    this.destroyRef.onDestroy(() => this.voiceRoomViewService.attachHost(null));

    effect(() => {
      const id = this.roomId();
      const alreadyJoinedFor = this.joinedForRoomId();
      const current = this.voiceRoomStore.selectedRoomId();

      if (!id || !Number.isFinite(id) || id <= 0) {
        return;
      }
      if (alreadyJoinedFor === id) {
        return;
      }

      this.joinedForRoomId.set(id);
      if (current === id) {
        return;
      }

      void this.voiceSessionService
        .joinSession({
          type: EVoiceSessionType.GROUP_ROOM,
          roomId: id,
        })
        .catch((error: unknown) => {
          this.voiceSessionService.reportJoinFailure(error);
        });
    });
  }

  protected revealChrome(): void {
    this.voiceRoomViewService.revealChrome();
  }

  protected onLeft(): void {
    void this.router.navigate(['/']);
  }
}
