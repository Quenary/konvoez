import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TextareaClasses, TextareaModule } from 'primeng/textarea';
import { IMessageWithStatus } from '../text-room.reducer';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { messageMaxLength, messageMinLength } from '@common/const';
import { TextRoomCommon } from '@common/text-room';
import { Store } from '@ngrx/store';
import { TextRoomActions } from '../text-room.actions';
import { v4 } from 'uuid';
import { selectTextRoomSelectedId } from '../text-room.selectors';

@Component({
  selector: 'app-text-room-control',
  imports: [TextareaModule, ButtonModule, ReactiveFormsModule],
  templateUrl: './text-room-control.component.html',
  styleUrl: './text-room-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomControlComponent {
  private readonly store = inject(Store);

  /**
   * Editable message
   */
  public readonly message = model<IMessageWithStatus | null>();

  protected readonly form = new FormGroup({
    content: new FormControl<string | null>(null, [
      Validators.required,
      Validators.minLength(messageMinLength),
      Validators.maxLength(messageMaxLength),
    ]),
  });

  private readonly roomId = this.store.selectSignal(selectTextRoomSelectedId);

  protected onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const content = this.form.value.content as string;
    const message = this.message();
    this.form.patchValue({
      content: null,
    });
    if (message) {
      this.store.dispatch(
        TextRoomActions.editMessage({
          messageId: message.id,
          data: {
            content,
          },
        }),
      );
      this.message.set(null);
    } else {
      const roomId = this.roomId();
      this.store.dispatch(
        TextRoomActions.createMessage({
          tempId: v4(),
          data: {
            content,
            roomId,
            recipientId: null,
          },
        }),
      );
    }
  }
}
