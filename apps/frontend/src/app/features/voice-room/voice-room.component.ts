import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { RoomsStore } from '@core/stores/rooms.store';
import { EVoiceSessionType } from '@konvoez/shared';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { RoomManageService } from '../rooms/room-manage.service';
import { RoomContextMenuComponent } from '../rooms/room-context-menu/room-context-menu.component';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiDropdown, TuiHint } from '@taiga-ui/core';
import { IRoom } from '@konvoez/shared';

@Component({
  selector: 'app-voice-room',
  imports: [
    VoiceRoomShellComponent,
    RoomContextMenuComponent,
    TranslatePipe,
    TuiButton,
    TuiDropdown,
    TuiHint,
  ],
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
  private readonly destroyRef = inject(DestroyRef);
  protected readonly roomManageService = inject(RoomManageService);

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

  protected readonly canManageRooms = this.roomManageService.canManageRooms;

  private readonly roomsDict = this.roomsStore.roomsDict;
  private readonly roomId = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('id')))),
  );

  constructor() {
    effect(() => {
      const id = this.roomId();
      const alreadyJoinedFor = this.joinedForRoomId();
      const current = this.voiceSessionStore.selectedRoomId();
      const joining = this.voiceSessionService.joiningTarget();

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
      if (
        joining?.type === EVoiceSessionType.GROUP_ROOM &&
        joining.roomId === id
      ) {
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

    this.voiceSessionService.roomClosed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ roomId }) => {
        if (roomId === this.roomId()) {
          void this.router.navigate(['/']);
        }
      });
  }

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }

  protected onLeft(): void {
    void this.router.navigate(['/']);
  }
}
