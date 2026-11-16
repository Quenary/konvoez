import { computed, inject, Injectable, Injector } from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsStore } from '@core/stores/rooms.store';
import { TranslateService } from '@ngx-translate/core';
import {
  EPermission,
  ERoomType,
  IRoom,
  IRoomCreate,
  IRoomUpdate,
} from '@konvoez/shared';
import { TUI_CONFIRM, TuiConfirmData } from '@taiga-ui/kit';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import type { RoomDialogData } from './room-dialog/room-dialog.component';

/**
 * Facade service for managing rooms.
 */
@Injectable({ providedIn: 'root' })
export class RoomManageService {
  private readonly ngrxStore = inject(Store);
  private readonly roomsStore = inject(RoomsStore);
  private readonly translateService = inject(TranslateService);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly injector = inject(Injector);

  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);

  public readonly canManageRooms = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_ROOMS),
    );
  });

  public moveRoom(room: IRoom, direction: 'up' | 'down'): void {
    if (!this.canManageRooms()) return;

    const list =
      room.type === ERoomType.TEXT
        ? this.roomsStore.textRooms()
        : this.roomsStore.voiceRooms();
    const currentIndex = list.findIndex((r) => r.id === room.id);
    if (currentIndex === -1) return;

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const reordered = [...list];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    this.roomsStore.reorder(reordered.map((r) => r.id));
  }

  public reorderRooms(
    type: ERoomType,
    previousIndex: number,
    currentIndex: number,
  ): void {
    if (!this.canManageRooms()) return;
    if (previousIndex === currentIndex) return;

    const list =
      type === ERoomType.TEXT
        ? this.roomsStore.textRooms()
        : this.roomsStore.voiceRooms();

    if (
      previousIndex < 0 ||
      previousIndex >= list.length ||
      currentIndex < 0 ||
      currentIndex >= list.length
    ) {
      return;
    }

    const reordered = [...list];
    const [moved] = reordered.splice(previousIndex, 1);
    reordered.splice(currentIndex, 0, moved);

    this.roomsStore.reorder(reordered.map((r) => r.id));
  }

  public async openRoomDetails(room: IRoom): Promise<void> {
    const { RoomDetailsDialogComponent } =
      await import('./room-details-dialog/room-details-dialog.component');

    this.tuiResponsiveDialogService
      .open<void>(
        new PolymorpheusComponent(RoomDetailsDialogComponent, this.injector),
        {
          closable: true,
          data: room,
        },
      )
      .subscribe();
  }

  public async editRoom(room: IRoom): Promise<void> {
    const { RoomDialogComponent } =
      await import('./room-dialog/room-dialog.component');

    this.tuiResponsiveDialogService
      .open<RoomDialogData>(
        new PolymorpheusComponent(RoomDialogComponent, this.injector),
        {
          closable: true,
          data: room,
          label: this.translateService.instant('ROOMS.DIALOG.EDIT_HEADER'),
        },
      )
      .subscribe({
        next: (data) => {
          if (!data?.id || !data.name) return;

          const body: IRoomUpdate = {
            name: data.name,
            ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
            ...(data.isPrivate !== undefined
              ? { isPrivate: data.isPrivate }
              : {}),
            ...(data.allowedRoleIds !== undefined
              ? { allowedRoleIds: data.allowedRoleIds }
              : {}),
            ...(data.allowedUserIds !== undefined
              ? { allowedUserIds: data.allowedUserIds }
              : {}),
          };

          this.roomsStore.update({ id: data.id, room: body });
        },
      });
  }

  public deleteRoom(room: IRoom): void {
    this.tuiResponsiveDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant('ROOMS.DELETE_CONFIRM'),
        data: {
          yes: this.translateService.instant('GENERAL.DELETE'),
          no: this.translateService.instant('GENERAL.CANCEL'),
          appearance: 'negative',
        } satisfies TuiConfirmData,
      })
      .subscribe((res) => {
        if (!res) return;

        this.roomsStore.remove(room.id);
      });
  }

  public async createRoom(type: ERoomType): Promise<void> {
    const { RoomDialogComponent } =
      await import('./room-dialog/room-dialog.component');

    this.tuiResponsiveDialogService
      .open<RoomDialogData>(
        new PolymorpheusComponent(RoomDialogComponent, this.injector),
        {
          closable: true,
          data: { type },
          label: this.translateService.instant('ROOMS.DIALOG.ADD_HEADER'),
        },
      )
      .subscribe({
        next: (room) => {
          if (!room?.name || !room.type) return;

          const body: IRoomCreate = {
            name: room.name,
            type: room.type,
            ...(room.avatar ? { avatar: room.avatar } : {}),
            ...(room.isPrivate !== undefined
              ? { isPrivate: room.isPrivate }
              : {}),
            ...(room.allowedRoleIds !== undefined
              ? { allowedRoleIds: room.allowedRoleIds }
              : {}),
            ...(room.allowedUserIds !== undefined
              ? { allowedUserIds: room.allowedUserIds }
              : {}),
          };

          this.roomsStore.create(body);
        },
      });
  }
}
