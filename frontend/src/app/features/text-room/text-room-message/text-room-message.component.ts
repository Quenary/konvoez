import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ContextMenuModule } from 'primeng/contextmenu';
import { IMessageWithStatus } from '../text-room.reducer';
import { MenuItem } from 'primeng/api';
import { Store } from '@ngrx/store';
import { selectMe } from '../../auth/auth.selectors';
import { IGetUser } from '../../user/user.interface';
import { AvatarModule } from 'primeng/avatar';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-text-room-message',
  imports: [TranslatePipe, ContextMenuModule, AvatarModule, DatePipe],
  templateUrl: './text-room-message.component.html',
  styleUrl: './text-room-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomMessageComponent {
  private readonly translateService = inject(TranslateService);
  private readonly store = inject(Store);

  public readonly message = input.required<IMessageWithStatus>();

  private readonly me = this.store.selectSignal(selectMe);

  protected readonly contextMenu = computed<MenuItem[]>(() => {
    const message = this.message();
    const me = this.me() as IGetUser;
    const menu: MenuItem[] = [];
    if (message.senderId === me.id) {
      menu.push(
        {
          label: this.translateService.instant('GENERAL.EDIT'),
          command: () => this.editMessage(),
        },
        {
          label: this.translateService.instant('GENERAL.DELETE'),
          command: () => this.deleteMessage(),
        },
      );
    }
    return menu;
  });

  private editMessage() {}

  private deleteMessage() {}
}
