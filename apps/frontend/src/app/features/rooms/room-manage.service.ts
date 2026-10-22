import { computed, inject, Injectable, Injector } from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsStore } from '@core/stores/rooms.store';
import { TranslateService } from '@ngx-translate/core';
import { EPermission } from '@konvoez/shared';
import { TUI_CONFIRM, TuiConfirmData } from '@taiga-ui/kit';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import type { RoomDialogData } from './room-dialog/room-dialog.component';
import { IRoom, IRoomUpdate } from '@konvoez/shared';

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
}
