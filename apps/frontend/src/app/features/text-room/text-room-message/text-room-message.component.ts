import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ContextMenuModule } from 'primeng/contextmenu';
import { IMessageEntity } from '../text-room.reducer';
import { MenuItem } from 'primeng/api';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { AvatarModule } from 'primeng/avatar';
import { TextRoomActions } from '../text-room.actions';
import { EUserRole, IUser } from '@konvoez/shared';
import { AngularTiptapEditorComponent } from '@flogeez/angular-tiptap-editor';
import { DayjsPipe } from '@shared/pipes/dayjs.pipe';

@Component({
  selector: 'app-text-room-message',
  imports: [
    ContextMenuModule,
    AvatarModule,
    DayjsPipe,
    ContextMenuModule,
    AngularTiptapEditorComponent,
  ],
  templateUrl: './text-room-message.component.html',
  styleUrl: './text-room-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomMessageComponent {
  private readonly translateService = inject(TranslateService);
  private readonly store = inject(Store);

  /**
   * Message
   */
  public readonly message = input.required<IMessageEntity>();

  protected readonly contextMenu = computed<MenuItem[]>(() => {
    const message = this.message();
    const me = this.currentUser() as IUser;
    if (message.senderId === me.id) {
      return [
        {
          label: this.translateService.instant('GENERAL.EDIT'),
          command: () => this.editMessage(),
        },
        {
          label: this.translateService.instant('GENERAL.DELETE'),
          command: () => this.deleteMessage(),
        },
      ];
    }
    if ([EUserRole.OWNER, EUserRole.ADMIN].includes(me.role)) {
      return [
        {
          label: this.translateService.instant('GENERAL.DELETE'),
          command: () => this.deleteMessage(),
        },
      ];
    }
    return [];
  });

  /**
   * Current user
   */
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  private editMessage(): void {
    this.store.dispatch(
      TextRoomActions.setEditableMessageId({
        id: this.message().id,
      }),
    );
  }

  private deleteMessage() {
    this.store.dispatch(
      TextRoomActions.deleteMessage({
        messageId: this.message().id,
      }),
    );
  }
}
