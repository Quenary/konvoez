import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiButtonX } from '@taiga-ui/core';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import {
  provideTuiEditor,
  TUI_EDITOR_SANITIZER,
  TuiEditor,
  TuiEditorTool,
  type TuiEditorToolType,
} from '@taiga-ui/editor';
import { v4 } from 'uuid';
import { createKeyBindingExtension } from '../../../core/tiptap/create-key-binding-extension';
import { TextRoomStore } from '../text-room.store';

const EMPTY_HTML_PATTERN = /^(\s*<p>(\s|<br\s*\/?>)*<\/p>\s*)*$/i;

@Component({
  selector: 'app-text-room-editor',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonX,
    TuiEditor,
  ],
  providers: [
    {
      provide: TUI_EDITOR_SANITIZER,
      useClass: NgDompurifySanitizer,
    },
    provideTuiEditor(
      {
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        taskList: false,
        taskItem: false,
        horizontalRule: false,
        textAlign: false,
        subscript: false,
        superscript: false,
        fontColor: true,
        backgroundColor: false,
        fontSize: false,
        jumpAnchor: false,
        fileLink: false,
        table: false,
        tableCell: false,
        tableRow: false,
        tableHeader: false,
        tableCellBackground: false,
        details: false,
        detailsSummary: false,
        detailsContent: false,
        image: false,
        video: false,
        audio: false,
        source: false,
        iframe: false,
        enter: false,
      },
      (injector) => {
        const component = injector.get(TextRoomEditorComponent);

        return Promise.resolve(
          createKeyBindingExtension('Enter', ({ editor }) => {
            if (editor.isActive('codeBlock')) return false;

            component.onSubmit();
            return true;
          }),
        );
      },
    ),
  ],
  templateUrl: './text-room-editor.component.html',
  styleUrl: './text-room-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomEditorComponent {
  private readonly textRoomStore = inject(TextRoomStore);

  protected readonly control = new FormControl<string>('', {
    nonNullable: true,
  });

  protected readonly tools: readonly TuiEditorToolType[] = [
    TuiEditorTool.Undo,
    TuiEditorTool.Bold,
    TuiEditorTool.Italic,
    TuiEditorTool.Underline,
    TuiEditorTool.Strikethrough,
    TuiEditorTool.Color,
    TuiEditorTool.Quote,
    TuiEditorTool.Code,
    TuiEditorTool.Link,
    TuiEditorTool.Clear,
  ];

  protected readonly editableMessage = this.textRoomStore.editableMessage;

  constructor() {
    effect(() => {
      const editableMessage = this.editableMessage();
      this.control.setValue(editableMessage?.content ?? '', {
        emitEvent: false,
      });
    });
  }

  protected onSubmit(): void {
    const content = this.control.value.trim();
    if (!content || EMPTY_HTML_PATTERN.test(content)) {
      return;
    }

    this.control.setValue('');
    const editableMessage = this.editableMessage();
    if (editableMessage) {
      this.textRoomStore.updateMessage({
        messageId: editableMessage.id,
        data: { content },
      });
    } else {
      this.textRoomStore.createMessage({
        tempId: v4(),
        data: {
          content,
          roomId: this.textRoomStore.selectedRoomId(),
          recipientId: this.textRoomStore.selectedRecipientId(),
        },
      });
    }
  }

  protected cancelEdit(): void {
    this.textRoomStore.setEditableMessageId(null);
  }
}
