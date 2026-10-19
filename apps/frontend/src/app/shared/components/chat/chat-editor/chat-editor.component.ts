import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiButtonX,
  TuiDropdown,
  TuiNotificationService,
} from '@taiga-ui/core';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import {
  provideTuiEditor,
  TUI_EDITOR_SANITIZER,
  TuiEditor,
  TuiEditorTool,
  type TuiEditorToolType,
} from '@taiga-ui/editor';
import { TuiAutoColorPipe, TuiButtonLoading } from '@taiga-ui/kit';
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { firstValueFrom } from 'rxjs';
import { VideoPosterService } from '@core/services/video-poster.service';
import { createKeyBindingExtension } from '@core/tiptap/create-key-binding-extension';
import { createPasteFilesExtension } from '@core/tiptap/create-paste-files-extension';
import { createPasteLinkExtension } from '@core/tiptap/create-paste-link-extension';
import { createKonvoezMention } from '@core/tiptap/mention/mention.extension';
import {
  deserializeMentionTokens,
  serializeMentionNodes,
} from '@core/tiptap/mention/mention-serialization';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { RolesStore } from '@core/stores/roles.store';
import { RoomsStore } from '@core/stores/rooms.store';
import { SettingsStore } from '@core/stores/settings.store';
import { UsersStore } from '@core/stores/users.store';
import {
  canAccessRoomSnapshot,
  EPermission,
  ITextRoomMessage,
  MENTION_EVERYONE,
  messageContentSchema,
  SCHEMA_ERROR,
  TMentionSegment,
} from '@konvoez/shared';
import { TextContentPipe } from '@shared/pipes/text-content.pipe';
import { ComposerDraftsService, TChatKey } from '../composer-drafts';
import { ChatComposerAttachmentsComponent } from '../chat-composer-attachments/chat-composer-attachments.component';
import {
  createLocalFile,
  ILocalFile,
  revokeLocalFiles,
  withClientPoster,
} from '@core/chat/outgoing/outgoing.types';
import { CHAT_MENTIONS_ENABLED } from './chat-mentions-enabled.token';
import {
  IMentionSuggestionVm,
  MentionSuggestionsComponent,
} from './mention-suggestions/mention-suggestions.component';

const EMPTY_HTML_PATTERN = /^(\s*<p>(\s|<br\s*\/?>)*<\/p>\s*)*$/i;

export interface IChatEditorSubmission {
  readonly content: string;
  readonly files: readonly ILocalFile[];
  readonly replyToMessage: ITextRoomMessage | null;
}

@Component({
  selector: 'app-chat-editor',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonX,
    TuiButtonLoading,
    TuiEditor,
    TuiDropdown,
    TuiAutoColorPipe,
    TextContentPipe,
    ChatComposerAttachmentsComponent,
    MentionSuggestionsComponent,
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
        link: {
          autolink: true,
          linkOnPaste: true,
        },
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
        const enabled = injector.get(CHAT_MENTIONS_ENABLED, false);
        return Promise.resolve(
          enabled
            ? createKonvoezMention(injector)
            : Extension.create({ name: 'konvoezMentionDisabled' }),
        );
      },
      (injector) => {
        const component = injector.get(ChatEditorComponent);

        return Promise.resolve(
          createKeyBindingExtension('Enter', ({ editor }) => {
            if (editor.isActive('codeBlock')) return false;

            if (component.mentionOpen()) {
              component.insertActiveMention();
              return true;
            }

            component.onSubmit();
            return true;
          }),
        );
      },
      (injector) => {
        const component = injector.get(ChatEditorComponent);

        return Promise.resolve(
          createKeyBindingExtension('Escape', () => {
            if (component.mentionOpen()) {
              component.closeMentions();
              return true;
            }
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
          createKeyBindingExtension('ArrowDown', () => {
            if (!component.mentionOpen()) return false;
            component.selectNextMention();
            return true;
          }),
        );
      },
      (injector) => {
        const component = injector.get(ChatEditorComponent);
        return Promise.resolve(
          createKeyBindingExtension('ArrowUp', () => {
            if (!component.mentionOpen()) return false;
            component.selectPreviousMention();
            return true;
          }),
        );
      },
      (injector) => {
        const component = injector.get(ChatEditorComponent);
        return Promise.resolve(
          createKeyBindingExtension('Tab', () => {
            if (!component.mentionOpen()) return false;
            component.insertActiveMention();
            return true;
          }),
        );
      },
      (injector) => {
        const component = injector.get(ChatEditorComponent);
        return Promise.resolve(
          createPasteFilesExtension((files) => component.addFiles(files)),
        );
      },
      () => Promise.resolve(createPasteLinkExtension()),
    ),
  ],
  templateUrl: './chat-editor.component.html',
  styleUrl: './chat-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatEditorComponent {
  private readonly settingsStore = inject(SettingsStore);
  private readonly drafts = inject(ComposerDraftsService);
  private readonly videoPosterService = inject(VideoPosterService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly store = inject(Store);
  private readonly usersStore = inject(UsersStore);
  private readonly rolesStore = inject(RolesStore);
  private readonly roomsStore = inject(RoomsStore);
  protected readonly mentionsEnabled = inject(CHAT_MENTIONS_ENABLED);

  protected readonly usersById = computed(() => this.usersStore.entityMap());
  protected readonly rolesById = computed(() => this.rolesStore.rolesById());

  public readonly editableMessage = input<ITextRoomMessage | null>(null);
  public readonly replyToMessage = input<ITextRoomMessage | null>(null);
  public readonly draftKey = input<TChatKey | null>(null);
  public readonly loading = input(false);
  public readonly mentionRoomId = input<number | null>(null);
  public readonly submitted = output<IChatEditorSubmission>();
  public readonly edited = output<{ messageId: string; content: string }>();
  public readonly replyCancelled = output<void>();
  public readonly editCancelled = output<void>();

  public readonly mentionOpen = computed(
    () =>
      this.mentionsEnabled &&
      !!this.mentionQuery() &&
      this.rawSuggestions().length > 0,
  );

  protected readonly tuiEditor = viewChild(TuiEditor);
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

  protected readonly mentionQuery = signal<{
    text: string;
    from: number;
    to: number;
  } | null>(null);

  protected readonly activeIndex = linkedSignal({
    source: () => this.mentionQuery(),
    computation: () => 0,
  });

  protected readonly rawSuggestions = computed<readonly IMentionSuggestionVm[]>(
    () => {
      const enabled = this.mentionsEnabled;
      const query = this.mentionQuery();
      const roomId = this.mentionRoomId();
      const allUsers = this.usersStore.entities();
      const roomsDict = this.roomsStore.roomsDict();
      const mentionableRoles = this.rolesStore.mentionableRoles();
      const currentUser = this.currentUser();
      const everyoneHint = this.everyoneHint();

      if (!enabled || !query) {
        return [];
      }

      const q = query.text.toLowerCase();
      const room = roomId != null ? roomsDict[roomId] : null;

      const eligibleUsers = allUsers.filter((u) => {
        if (u.deletedAt) {
          return false;
        }
        if (currentUser && u.id === currentUser.id) {
          return false;
        }
        if (room && room.isPrivate) {
          return canAccessRoomSnapshot(
            {
              id: u.id,
              isOwner: u.isOwner,
              permissions: u.permissions,
              roleIds: u.roles?.map((r) => r.id) ?? [],
            },
            room,
          );
        }
        return true;
      });

      const canMentionEveryone = !!(
        currentUser?.isOwner ||
        currentUser?.permissions?.includes(EPermission.MENTION_EVERYONE)
      );

      const eligibleRoles = canMentionEveryone ? mentionableRoles : [];

      const prefixUsers: IMentionSuggestionVm[] = [];
      const subUsers: IMentionSuggestionVm[] = [];

      for (const u of eligibleUsers) {
        const uName = u.username.toLowerCase();
        const fName = (u.fullname ?? '').toLowerCase();
        const isPrefix = uName.startsWith(q) || fName.startsWith(q);
        const isSub = !isPrefix && (uName.includes(q) || fName.includes(q));

        if (isPrefix || isSub) {
          const vm: IMentionSuggestionVm = {
            key: `user-${u.id}`,
            kind: 'user',
            id: u.id,
            label: `@${u.username}`,
            secondary: u.fullname ?? '',
            avatar: {
              kind: 'user',
              username: u.username,
              fullname: u.fullname ?? '',
              avatarUrl: u.avatarUrl ?? null,
            },
            active: false,
          };
          if (isPrefix) {
            prefixUsers.push(vm);
          } else {
            subUsers.push(vm);
          }
        }
      }

      const prefixRoles: IMentionSuggestionVm[] = [];
      const subRoles: IMentionSuggestionVm[] = [];

      for (const r of eligibleRoles) {
        const rName = r.name.toLowerCase();
        const isPrefix = rName.startsWith(q);
        const isSub = !isPrefix && rName.includes(q);

        if (isPrefix || isSub) {
          const vm: IMentionSuggestionVm = {
            key: `role-${r.id}`,
            kind: 'role',
            id: r.id,
            label: `@${r.name}`,
            secondary: '',
            avatar: {
              kind: 'role',
              name: r.name,
              color: r.color ?? null,
            },
            active: false,
          };
          if (isPrefix) {
            prefixRoles.push(vm);
          } else {
            subRoles.push(vm);
          }
        }
      }

      prefixUsers.sort((a, b) => a.label.localeCompare(b.label));
      subUsers.sort((a, b) => a.label.localeCompare(b.label));
      prefixRoles.sort((a, b) => a.label.localeCompare(b.label));
      subRoles.sort((a, b) => a.label.localeCompare(b.label));

      const candidatePool = [
        ...prefixUsers,
        ...prefixRoles,
        ...subUsers,
        ...subRoles,
      ];

      const isEveryonePrefix = 'everyone'.startsWith(q);
      const isEveryoneSub = !isEveryonePrefix && 'everyone'.includes(q);
      const everyoneMatched =
        canMentionEveryone && (isEveryonePrefix || isEveryoneSub);

      if (everyoneMatched) {
        const everyoneVm: IMentionSuggestionVm = {
          key: 'everyone',
          kind: 'everyone',
          id: null,
          label: MENTION_EVERYONE,
          secondary: everyoneHint,
          avatar: { kind: 'everyone' },
          active: false,
        };
        return [...candidatePool.slice(0, 7), everyoneVm];
      }

      return candidatePool.slice(0, 8);
    },
  );

  protected readonly suggestionVms = computed<readonly IMentionSuggestionVm[]>(
    () => {
      const items = this.rawSuggestions();
      const active = this.activeIndex();
      return items.map((item, index) => ({
        ...item,
        active: index === active,
      }));
    },
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  protected readonly unknownLabel = toSignal(
    this.translateService.stream('CHAT.MENTION_UNKNOWN'),
    { initialValue: 'unknown' },
  );
  private readonly everyoneHint = toSignal(
    this.translateService.stream('CHAT.MENTION_EVERYONE_HINT'),
    { initialValue: '' },
  );
  private chatKey = this.draftKey();
  private tiptapEditor: Editor | null = null;
  private lastEditableMessageKey: string | null = null;

  constructor() {
    effect(() => {
      const editableMessage = this.editableMessage();
      const currentKey = editableMessage
        ? `${editableMessage.id}:${editableMessage.content}`
        : null;

      if (currentKey === this.lastEditableMessageKey) {
        return;
      }
      this.lastEditableMessageKey = currentKey;

      if (!editableMessage) {
        this.control.setValue('', { emitEvent: false });
        return;
      }

      untracked(() => {
        const enabled = this.mentionsEnabled;
        const unknown = this.unknownLabel();
        const users = this.usersStore.entityMap();
        const roles = this.rolesStore.rolesById();

        const raw = editableMessage.content ?? '';
        const resolved = enabled
          ? deserializeMentionTokens(raw, (seg: TMentionSegment) => {
              if (seg.type === 'everyone') {
                return MENTION_EVERYONE;
              }
              if (seg.type === 'role') {
                const role = roles[seg.id];
                return role ? `@${role.name}` : `@${unknown}`;
              }
              if (seg.type === 'user') {
                const user = users[seg.id];
                return user ? `@${user.username}` : `@${unknown}`;
              }
              return `@${unknown}`;
            })
          : raw;

        this.control.setValue(resolved, { emitEvent: false });
      });
    });

    effect(() => {
      if (this.loading()) {
        this.control.disable({ emitEvent: false });
      } else {
        this.control.enable({ emitEvent: false });
      }
    });

    effect(() => {
      const nextKey = this.draftKey();
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
    if (
      this.loading() ||
      !this.attachmentsEnabled() ||
      this.editableMessage()
    ) {
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

  insertMention(item: IMentionSuggestionVm): void {
    const query = this.mentionQuery();
    const editor = this.getTiptapEditor();
    if (!query || !editor) {
      return;
    }

    const cleanLabel = item.label.startsWith('@')
      ? item.label.slice(1)
      : item.label;

    editor
      .chain()
      .focus()
      .insertContentAt({ from: query.from, to: query.to }, [
        {
          type: 'mention',
          attrs: {
            kind: item.kind,
            id: item.id,
            label: cleanLabel,
          },
        },
        { type: 'text', text: ' ' },
      ])
      .run();

    this.mentionQuery.set(null);
  }

  insertActiveMention(): void {
    const items = this.rawSuggestions();
    const index = this.activeIndex();
    const active = items[index] ?? items[0];
    if (active) {
      this.insertMention(active);
    }
  }

  selectNextMention(): void {
    const count = this.rawSuggestions().length;
    if (count === 0) return;
    this.activeIndex.update((i) => (i + 1) % count);
  }

  selectPreviousMention(): void {
    const count = this.rawSuggestions().length;
    if (count === 0) return;
    this.activeIndex.update((i) => (i - 1 + count) % count);
  }

  closeMentions(): void {
    this.mentionQuery.set(null);
  }

  onSubmit(): void {
    if (this.loading()) {
      return;
    }
    const raw = this.control.value.trim();
    const content = this.mentionsEnabled
      ? serializeMentionNodes(raw).trim()
      : raw;

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

    if (editableMessage) {
      this.edited.emit({
        messageId: editableMessage.id,
        content: payload,
      });
      return;
    }

    const files = this.files();
    this.files.set([]);
    this.submitted.emit({
      content: payload,
      files,
      replyToMessage: this.replyToMessage(),
    });
  }

  cancelEdit(): void {
    this.editCancelled.emit();
  }

  cancelReply(): void {
    this.replyCancelled.emit();
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

  protected onEditorLoaded(): void {
    if (!this.mentionsEnabled) {
      return;
    }
    const origin = this.tuiEditor()?.editor?.getOriginTiptapEditor() ?? null;
    if (!origin || this.tiptapEditor === origin) {
      return;
    }
    this.tiptapEditor = origin;

    const onUpdate = (): void => {
      this.detectMentionTrigger();
    };

    origin.on('selectionUpdate', onUpdate);
    origin.on('update', onUpdate);

    this.destroyRef.onDestroy(() => {
      origin.off('selectionUpdate', onUpdate);
      origin.off('update', onUpdate);
    });
  }

  protected onMentionDropdown(open: boolean): void {
    if (!open) {
      this.closeMentions();
    }
  }

  private detectMentionTrigger(): void {
    if (!this.mentionsEnabled) {
      this.mentionQuery.set(null);
      return;
    }
    const editor = this.getTiptapEditor();
    if (!editor) {
      this.mentionQuery.set(null);
      return;
    }

    const { state } = editor;
    const { selection } = state;
    const { $from } = selection;

    if (!selection.empty) {
      this.mentionQuery.set(null);
      return;
    }

    const isCode =
      editor.isActive('code') ||
      editor.isActive('codeBlock') ||
      $from.parent.type.name === 'codeBlock' ||
      $from.marks().some((mark) => mark.type.name === 'code');

    if (isCode) {
      this.mentionQuery.set(null);
      return;
    }

    const textBefore = $from.parent.textBetween(
      0,
      $from.parentOffset,
      '\n',
      '\ufffc',
    );
    const match = /(?:^|\s)@([\p{L}\p{N}_.-]{0,32})$/u.exec(textBefore);

    if (!match) {
      this.mentionQuery.set(null);
      return;
    }

    const queryText = match[1];
    const from = $from.pos - queryText.length - 1;
    const to = $from.pos;

    this.mentionQuery.set({
      text: queryText,
      from,
      to,
    });
  }

  private getTiptapEditor(): Editor | null {
    if (this.tiptapEditor) {
      return this.tiptapEditor;
    }
    const origin = this.tuiEditor()?.editor?.getOriginTiptapEditor() ?? null;
    if (origin) {
      this.tiptapEditor = origin;
    }
    return origin;
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
