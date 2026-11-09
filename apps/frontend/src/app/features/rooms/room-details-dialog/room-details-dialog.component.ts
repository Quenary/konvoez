import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiDialogContext, TuiHint } from '@taiga-ui/core';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { injectContext } from '@taiga-ui/polymorpheus';
import { ERoomType, IRoom } from '@konvoez/shared';
import { MediaGalleryComponent } from '@shared/components/media-gallery/media-gallery.component';
import { RoomManageService } from '../room-manage.service';
import { icons } from '@constants';

@Component({
  selector: 'app-room-details-dialog',
  imports: [
    TranslatePipe,
    TuiAvatar,
    TuiButton,
    TuiHint,
    TuiInitialsPipe,
    MediaGalleryComponent,
  ],
  templateUrl: './room-details-dialog.component.html',
  styleUrl: './room-details-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomDetailsDialogComponent {
  private readonly context = injectContext<TuiDialogContext<void, IRoom>>();
  private readonly router = inject(Router);
  private readonly roomManageService = inject(RoomManageService);

  protected readonly icons = icons;
  protected readonly room = this.context.data;

  protected readonly canManage = computed(() =>
    this.roomManageService.canManageRooms(),
  );

  protected readonly typeKey =
    this.room.type === ERoomType.TEXT
      ? 'ROOMS.DIALOG.TEXT'
      : 'ROOMS.DIALOG.VOICE';

  protected readonly isMediaVisible = this.room.type === ERoomType.TEXT;

  protected editRoom(): void {
    this.close();
    void this.roomManageService.editRoom(this.room);
  }

  protected deleteRoom(): void {
    this.close();
    this.roomManageService.deleteRoom(this.room);
  }

  protected onGoToMessage(messageId: string): void {
    this.close();
    void this.router.navigate(['/text-room', this.room.id], {
      queryParams: { message: messageId },
    });
  }

  protected close(): void {
    this.context.completeWith();
  }
}
