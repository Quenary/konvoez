import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { ERoomType, EVoiceSessionType, IRoom } from '@konvoez/shared';

/**
 * Room list selection: updates RoomsStore and navigates or joins voice as needed.
 */
@Injectable({ providedIn: 'root' })
export class RoomNavigationService {
  private readonly roomsStore = inject(RoomsStore);
  private readonly router = inject(Router);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceSessionStore = inject(VoiceSessionStore);

  /** When the voice room was closed server-side, leave its page if the user is still on it. */
  public leaveVoiceRoomPageIfViewing(roomId: number): void {
    const match = this.router.url.match(/^\/voice-room\/(\d+)(?:\?.*)?$/);
    if (!match || Number(match[1]) !== roomId) {
      return;
    }
    void this.router.navigate(['/']);
  }

  public selectRoom(room: IRoom | null): void {
    this.roomsStore.setSelectedRoomId(room?.id ?? null);

    switch (room?.type) {
      case ERoomType.VOICE: {
        const selectedVoiceRoomId = this.voiceSessionStore.selectedRoomId();
        if (selectedVoiceRoomId !== room.id) {
          void this.voiceSessionService
            .joinSession({
              type: EVoiceSessionType.GROUP_ROOM,
              roomId: room.id,
            })
            .catch((error: unknown) => {
              this.voiceSessionService.reportJoinFailure(error);
            });
        }
        void this.router.navigate([`/voice-room/${room.id}`]);
        break;
      }
      case ERoomType.TEXT: {
        void this.router.navigate([`/text-room/${room.id}`]);
        break;
      }
      default:
        void this.router.navigate(['/']);
    }
  }
}
