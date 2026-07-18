import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { messageMaxLength, messageMinLength } from '@konvoez/shared';
import { Store } from '@ngrx/store';
import { TextRoomActions } from '../text-room.actions';
import { v4 } from 'uuid';
import {
  selectTextRoomEditableMessage,
  selectTextRoomSelectedId,
  selectTextRoomSelectedRecipientId,
} from '../text-room.selectors';
import { TranslatePipe } from '@ngx-translate/core';
import {
  AngularTiptapEditorComponent,
  AteEditorConfig,
  AteNodeViewRenderer,
  AteI18nService,
} from '@flogeez/angular-tiptap-editor';

@Component({
  selector: 'app-text-room-control',
  imports: [
    TextareaModule,
    ButtonModule,
    ReactiveFormsModule,
    TranslatePipe,
    AngularTiptapEditorComponent,
  ],
  templateUrl: './text-room-control.component.html',
  styleUrl: './text-room-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomControlComponent {
  private readonly store = inject(Store);

  protected readonly content = signal<string>('');
  protected readonly editableMessage = this.store.selectSignal(
    selectTextRoomEditableMessage,
  );

  private readonly roomId = this.store.selectSignal(selectTextRoomSelectedId);
  private readonly recipientId = this.store.selectSignal(
    selectTextRoomSelectedRecipientId,
  );

  constructor() {
    effect(() => {
      const editableMessage = this.editableMessage();
      this.content.set(editableMessage?.content ?? '');
    });
  }

  protected onSubmit(): void {
    const content = this.content();
    if (!this.content) {
      return;
    }

    this.content.set('');
    const editableMessage = this.editableMessage();
    if (editableMessage) {
      this.store.dispatch(
        TextRoomActions.updateMessage({
          messageId: editableMessage.id,
          data: {
            content,
          },
        }),
      );
    } else {
      const roomId = this.roomId();
      const recipientId = this.recipientId();
      this.store.dispatch(
        TextRoomActions.createMessage({
          tempId: v4(),
          data: {
            content,
            roomId,
            recipientId,
          },
        }),
      );
    }
  }

  protected cancelEdit(): void {
    this.store.dispatch(TextRoomActions.setEditableMessageId({ id: null }));
  }
}
