import { computed, inject, Injectable, Injector } from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsStore } from './rooms.store';
import { TranslateService } from '@ngx-translate/core';
import { EUserRole } from '@konvoez/shared';
import { TuiDialogService } from '@taiga-ui/core';
import { TUI_CONFIRM, TuiConfirmData } from '@taiga-ui/kit';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import type { RoomDialogData } from './room-dialog/room-dialog.component';
import { IRoom, IRoomUpdate } from './rooms.interface';

/**
 * Facade service for managing rooms.
 */
@Injectable({ providedIn: 'root' })
export class RoomManageService {
  private readonly ngrxStore = inject(Store);
  private readonly roomsStore = inject(RoomsStore);
  private readonly translateService = inject(TranslateService);
  private readonly tuiDialogService = inject(TuiDialogService);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly injector = inject(Injector);

  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);

  public readonly canManageRooms = computed(() => {
    const role = this.currentUser()?.role;
    return role === EUserRole.ADMIN || role === EUserRole.OWNER;
  });

  public async editRoom(room: IRoom): Promise<void> {
    const { RoomDialogComponent } =
      await import('./room-dialog/room-dialog.component');

    this.tuiDialogService
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
