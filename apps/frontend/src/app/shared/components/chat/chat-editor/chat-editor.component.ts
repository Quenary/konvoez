import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TuiButton, TuiButtonX, TuiNotificationService } from '@taiga-ui/core';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import {
  provideTuiEditor,
  TUI_EDITOR_SANITIZER,
  TuiEditor,
  TuiEditorTool,
  type TuiEditorToolType,
} from '@taiga-ui/editor';
import { TuiAutoColorPipe } from '@taiga-ui/kit';
import { v4 } from 'uuid';
import { firstValueFrom } from 'rxjs';
import { VideoPosterService } from '@core/services/video-poster.service';
import { createKeyBindingExtension } from '@core/tiptap/create-key-binding-extension';
import { createPasteFilesExtension } from '@core/tiptap/create-paste-files-extension';
import { SCHEMA_ERROR, messageContentSchema } from '@konvoez/shared';
import { TextContentPipe } from '@shared/pipes/text-content.pipe';
import { SettingsStore } from '@features/settings/settings.store';
import { ChatStore } from '../chat.store';
import { chatTargetToApiIds } from '../chat-target';
import { ComposerDraftsService, toChatKey } from '../composer-drafts';
import { ChatComposerAttachmentsComponent } from '../chat-composer-attachments/chat-composer-attachments.component';
import {
  createLocalFile,
  ILocalFile,
  revokeLocalFiles,
  withClientPoster,
} from '@core/chat/outgoing/outgoing.types';

const EMPTY_HTML_PATTERN = /^(\s*<p>(\s|<br\s*\/?>)*<\/p>\s*)*$/i;

@Component({
  selector: 'app-chat-editor',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonX,
    TuiEditor,
    TuiAutoColorPipe,
    TextContentPipe,
    ChatComposerAttachmentsComponent,
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
        const component = injector.get(ChatEditorComponent);

        return Promise.resolve(
          createKeyBindingExtension('Enter', ({ editor }) => {
            if (editor.isActive('codeBlock')) return false;

            component.onSubmit();
            return true;
          }),
        );
      },
      (injector) => {
        const component = injector.get(ChatEditorComponent);

        return Promise.resolve(
          createKeyBindingExtension('Escape', () => {
            if (component.replyToMessage()) {
              component.cancelReply();
              return true;
            }
            if (component.editableMessage()) {
              component.cancelEdit();
              return true;
            }
            return false;
          }),
        );
      },
      (injector) => {
        const component = injector.get(ChatEditorComponent);
        return Promise.resolve(
          createPasteFilesExtension((files) => component.addFiles(files)),
        );
      },
    ),
  ],
  templateUrl: './chat-editor.component.html',
  styleUrl: './chat-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatEditorComponent {
  private readonly chatStore = inject(ChatStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly drafts = inject(ComposerDraftsService);
  private readonly videoPosterService = inject(VideoPosterService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  public readonly replyToMessage = this.chatStore.replyToMessage;

  protected readonly control = new FormControl('', {
    nonNullable: true,
  });
  protected readonly files = signal<readonly ILocalFile[]>([]);
  protected readonly attachmentsEnabled = this.settingsStore.attachmentsEnabled;
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
  protected readonly editableMessage = this.chatStore.editableMessage;

  private chatKey = (() => {
    const { roomId, recipientId } = chatTargetToApiIds(this.chatStore.target());
    return toChatKey(roomId, recipientId);
  })();

  constructor() {
    effect(() => {
      const editableMessage = this.editableMessage();
      this.control.setValue(editableMessage?.content ?? '', {
        emitEvent: false,
      });
    });

    effect(() => {
      const { roomId, recipientId } = chatTargetToApiIds(
        this.chatStore.target(),
      );
      const nextKey = toChatKey(roomId, recipientId);
      const previous = this.chatKey;
      if (previous === nextKey) {
        return;
      }
      untracked(() => {
        if (previous) {
          this.drafts.stash(previous, this.files());
          this.files.set(nextKey ? this.drafts.take(nextKey) : []);
        }
        this.chatKey = nextKey;
      });
    });

    this.destroyRef.onDestroy(() => {
      const key = this.chatKey;
      const files = this.files();
      if (key) {
        this.drafts.stash(key, files);
      } else {
        revokeLocalFiles(files);
      }
      this.files.set([]);
    });
  }

  addFiles(list: readonly File[]): boolean {
    if (!this.attachmentsEnabled() || this.editableMessage()) {
      if (!this.attachmentsEnabled()) {
        this.notify('ROOMS.UPLOAD_ERROR.DISABLED');
      }
      return false;
    }
    const maxSize = this.settingsStore.attachmentsMaxFileSize();
    const maxCount = this.settingsStore.attachmentsMaxFilesPerMessage();
    const next = [...this.files()];
    let tooBig = false;
    let overflow = false;
    for (const file of list) {
      if (file.size > maxSize) {
        tooBig = true;
        continue;
      }
      if (next.length >= maxCount) {
        overflow = true;
        break;
      }
      const local = createLocalFile(file);
      next.push({
        ...local,
        disposePoster:
          local.posterStatus === 'pending'
            ? () => this.videoPosterService.dispose(local.localId)
            : undefined,
      });
      if (local.posterStatus === 'pending') {
        void this.trackPoster(local.localId, file);
      }
    }
    this.files.set(next);
    if (tooBig) {
      this.notify('VALIDATION.FILE_TOO_BIG');
    }
    if (overflow) {
      this.notify('ROOMS.TOO_MANY_FILES', { max: maxCount });
    }
    return true;
  }

  protected onPick(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  protected removeFile(localId: string): void {
    const file = this.files().find((item) => item.localId === localId);
    if (file) {
      revokeLocalFiles([file]);
    }
    this.files.update((files) =>
      files.filter((item) => item.localId !== localId),
    );
  }

  protected onSubmit(): void {
    const content = this.control.value.trim();
    const editableMessage = this.editableMessage();
    const hasText = !!content && !EMPTY_HTML_PATTERN.test(content);
    const hasFiles = !editableMessage && this.files().length > 0;

    const keptAttachments = editableMessage?.attachments?.length ?? 0;
    if (editableMessage) {
      if (!hasText && keptAttachments === 0) {
        this.control.markAsTouched();
        this.notify(SCHEMA_ERROR.MESSAGE_LENGTH);
        return;
      }
    } else if (!hasText && !hasFiles) {
      this.control.markAsTouched();
      this.notify(SCHEMA_ERROR.MESSAGE_LENGTH);
      return;
    }

    const payload = hasText ? content : '';
    if (hasText) {
      const result = messageContentSchema.safeParse(payload);
      if (!result.success) {
        this.control.markAsTouched();
        this.notify(
          result.error.issues[0]?.message ?? SCHEMA_ERROR.MESSAGE_LENGTH,
        );
        return;
      }
    }

    this.control.reset();
    const replyTo = this.replyToMessage();

    if (editableMessage) {
      this.chatStore.updateMessage({
        messageId: editableMessage.id,
        data: { content: payload },
      });
      return;
    }

    const files = this.files();
    this.files.set([]);
    const { roomId, recipientId } = chatTargetToApiIds(this.chatStore.target());
    this.chatStore.createMessage({
      tempId: v4(),
      data: {
        content: payload,
        roomId,
        recipientId,
        replyToId: replyTo?.id ?? null,
        attachmentIds: [],
      },
      files,
    });
  }

  protected cancelEdit(): void {
    this.chatStore.setEditableMessageId(null);
  }

  protected cancelReply(): void {
    this.chatStore.setReplyToMessageId(null);
  }

  private async trackPoster(localId: string, file: File): Promise<void> {
    const result = await firstValueFrom(
      this.videoPosterService.capture(localId, file),
    );
    const posterUrl = result?.poster
      ? URL.createObjectURL(result.poster)
      : null;
    let applied = false;
    this.files.update((files) =>
      files.map((item) => {
        if (item.localId !== localId) {
          return item;
        }
        applied = true;
        if (item.posterUrl) {
          URL.revokeObjectURL(item.posterUrl);
        }
        return withClientPoster(item, result, posterUrl);
      }),
    );
    if (!applied && posterUrl) {
      URL.revokeObjectURL(posterUrl);
    }
  }

  private notify(message: string, params?: Record<string, unknown>): void {
    this.tuiNotificationsService
      .open(this.translateService.instant(message, params), {
        appearance: 'negative',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();
  }
}
