import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { RoomsStore } from '../rooms/rooms.store';
import { IRoom } from '@konvoez/shared';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { EVoiceSessionType } from '@konvoez/shared';

@Component({
  selector: 'app-voice-room',
  imports: [VoiceRoomShellComponent],
  templateUrl: './voice-room.component.html',
  styleUrl: './voice-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly roomsStore = inject(RoomsStore);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceSessionService = inject(VoiceSessionService);

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

  private readonly roomsDict = this.roomsStore.roomsDict;
  private readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('id')))),
  );

  constructor() {
    effect(() => {
      const id = this.roomId();
      const alreadyJoinedFor = this.joinedForRoomId();
      const current = this.voiceSessionStore.selectedRoomId();

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

  protected onLeft(): void {
    void this.router.navigate(['/']);
  }
}
