import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { IRoom, TVoiceRoomPeerUser } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { createLongtapClickGuard } from '@shared/functions/longtap-click-guard.function';
import { RoomManageService } from './room-manage.service';
import { RoomNavigationService } from './room-navigation.service';

export interface IVoiceRoomRow extends IRoom {
  peers: TVoiceRoomPeerUser[];
  isUserInRoom: boolean;
}

@Injectable()
export class RoomViewService {
  private readonly store = inject(Store);
  private readonly roomsStore = inject(RoomsStore);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly roomManageService = inject(RoomManageService);
  private readonly roomNavigationService = inject(RoomNavigationService);
  private readonly unreadCountsStore = inject(UnreadCountsStore);
  private readonly isTouch = inject(WA_IS_TOUCH);
  private readonly destroyRef = inject(DestroyRef);

  public readonly textRooms = this.roomsStore.textRooms;
  public readonly canManageRooms = this.roomManageService.canManageRooms;
  public readonly contextMenuRoom = signal<IRoom | null>(null);

  public readonly mentionFlags = computed<Record<number, boolean>>(() => {
    const mentions = this.unreadCountsStore.roomMentions();
    const flags: Record<number, boolean> = {};
    for (const [roomId, count] of Object.entries(mentions)) {
      if (count > 0) {
        flags[Number(roomId)] = true;
      }
    }
    return flags;
  });

  public readonly voiceRows = computed<IVoiceRoomRow[]>(() => {
    const rooms = this.roomsStore.voiceRooms();
    const roomsState = this.voiceLobbyStore.roomsState();
    const currentUserId = this.currentUser()?.id;
    return rooms.map((room) => {
      const peers = Object.values(roomsState[room.id] ?? {});
      return {
        ...room,
        peers,
        isUserInRoom: peers.some((peer) => peer.id === currentUserId),
      };
    });
  });

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly roomClickGuard = createLongtapClickGuard(() =>
    this.isTouch(),
  );

  constructor() {
    this.roomsStore.loadAll();
    this.destroyRef.onDestroy(() => {
      this.roomClickGuard.destroy();
    });
  }

  public onRoomLongtap(room: IRoom): void {
    this.contextMenuRoom.set(room);
    this.roomClickGuard.arm();
  }

  public onRoomClick(room: IRoom): void {
    if (this.roomClickGuard.consume()) {
      return;
    }
    this.roomNavigationService.selectRoom(room);
  }

  public openRoomDetails(room: IRoom): void {
    void this.roomManageService.openRoomDetails(room);
  }

  public editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  public deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }
}
