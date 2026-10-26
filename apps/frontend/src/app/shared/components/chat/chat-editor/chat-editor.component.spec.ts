import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatEditorComponent } from './chat-editor.component';
import { provideTranslateService } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TuiNotificationService } from '@taiga-ui/core';
import { EMessageStatus, IMessageEntity } from '../chat.store';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '@core/stores/settings.store';
import { UsersStore } from '@core/stores/users.store';
import { RolesStore } from '@core/stores/roles.store';
import { RoomsStore } from '@core/stores/rooms.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import {
  EAttachmentKind,
  EPermission,
  ERoomType,
  IAttachment,
  IRoleSummary,
  IRoom,
  IUserSafe,
  IUserFull,
} from '@konvoez/shared';
import { createLocalFile } from '@core/chat/outgoing/outgoing.types';
import { CHAT_MENTIONS_ENABLED } from './chat-mentions-enabled.token';
import { IMentionSuggestionVm } from './mention-suggestions/mention-suggestions.component';

describe('ChatEditorComponent', () => {
  let component: ChatEditorComponent;
  let fixture: ComponentFixture<ChatEditorComponent>;
  let store: MockStore;

  const mockCurrentUser: IUserFull = {
    id: 99,
    username: 'myuser',
    email: 'test@example.com',
    fullname: 'My User',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
    twoFactorEnabled: false,
  };

  const alice: IUserSafe = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Wonderland',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const bob: IUserSafe = {
    id: 2,
    username: 'bob',
    fullname: 'Bob Builder',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const adminRole: IRoleSummary = {
    id: 10,
    name: 'Admin',
    color: '#ff0000',
    priority: 1,
    mentionable: true,
  };

  const usersList = signal<IUserSafe[]>([alice, bob]);
  const usersMap = signal<Record<number, IUserSafe>>({ 1: alice, 2: bob });
  const mockUsersStore = {
    entities: usersList,
    entityMap: usersMap,
  };

  const mentionableRoles = signal<IRoleSummary[]>([adminRole]);
  const rolesMap = signal<Record<number, IRoleSummary>>({ 10: adminRole });
  const mockRolesStore = {
    mentionableRoles,
    rolesById: rolesMap,
  };

  const roomsDict = signal<Record<number, IRoom>>({});
  const mockRoomsStore = {
    roomsDict,
  };

  const mockReplyMessage: IMessageEntity = {
    id: 'reply-target-1',
    content: '<p>Original</p>',
    senderId: 2,
    senderUsername: 'bob',
    roomId: 1,
    recipientId: null,
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: null,
    isRead: false,
    attachments: [],
    clientId: null,
    status: EMessageStatus.SUCCESS,
    replyTo: null,
    reactions: [],
    mentions: { userIds: [], roleIds: [], everyone: false },
  };

  const mockNotificationService = {
    open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
  };

  const mockSettingsStore = {
    attachmentsEnabled: signal(true),
    attachmentsMaxFileSize: signal(50 * 1024 * 1024),
    attachmentsMaxFilesPerMessage: signal(10),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    usersList.set([alice, bob]);
    usersMap.set({ 1: alice, 2: bob });
    mentionableRoles.set([adminRole]);
    rolesMap.set({ 10: adminRole });
    roomsDict.set({});

    await TestBed.configureTestingModule({
      imports: [ChatEditorComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: mockCurrentUser }],
        }),
        { provide: SettingsStore, useValue: mockSettingsStore },
        { provide: TuiNotificationService, useValue: mockNotificationService },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: RolesStore, useValue: mockRolesStore },
        { provide: RoomsStore, useValue: mockRoomsStore },
      ],
    })
      .overrideComponent(ChatEditorComponent, {
        set: {
          template: '',
          providers: [],
        },
      })
      .compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(ChatEditorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should cancel reply', () => {
    const cancelled = vi.fn();
    component.replyCancelled.subscribe(cancelled);
    component.cancelReply();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('should cancel edit', () => {
    const cancelled = vi.fn();
    component.editCancelled.subscribe(cancelled);
    component.cancelEdit();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('should not attach a validator to the control and should notify on submit validation failure', () => {
    const control = component['control'];

    expect(control.validator).toBeNull();

    control.setValue('');
    component.onSubmit();

    expect(control.touched).toBe(true);
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'VALIDATION.MESSAGE_LENGTH',
      expect.objectContaining({
        appearance: 'negative',
      }),
    );
    mockNotificationService.open.mockClear();
    control.setValue('<p></p>');
    component.onSubmit();
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'VALIDATION.MESSAGE_LENGTH',
      expect.objectContaining({
        appearance: 'negative',
      }),
    );
  });

  it('should create message with replyToId when replyToMessage is active', () => {
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    fixture.componentRef.setInput('replyToMessage', mockReplyMessage);
    const control = component['control'];
    control.setValue('<p>This is a reply</p>');

    component.onSubmit();

    expect(submitted).toHaveBeenCalledWith({
      content: '<p>This is a reply</p>',
      files: [],
      replyToMessage: mockReplyMessage,
    });
    expect(control.value).toBe('');
  });

  it('should update message when editableMessage is active', () => {
    const edited = vi.fn();
    component.edited.subscribe(edited);
    fixture.componentRef.setInput('editableMessage', mockReplyMessage);
    fixture.detectChanges();
    const control = component['control'];
    control.setValue('<p>Edited content</p>');

    component.onSubmit();

    expect(edited).toHaveBeenCalledWith({
      messageId: 'reply-target-1',
      content: '<p>Edited content</p>',
    });
    expect(control.value).toBe('');
  });

  it('should send a files-only message and keep object urls for the outgoing store', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    const file = new File(['hi'], 'note.txt', { type: 'text/plain' });
    component.addFiles([file]);
    component.onSubmit();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '',
        files: [
          expect.objectContaining({
            kind: EAttachmentKind.FILE,
            previewUrl: null,
          }),
        ],
      }),
    );
    expect(component['files']()).toEqual([]);
    expect(revoke).not.toHaveBeenCalled();
    revoke.mockRestore();
  });

  it('should reject an oversize file and a pick past the file limit', () => {
    mockSettingsStore.attachmentsMaxFileSize.set(4);
    mockSettingsStore.attachmentsMaxFilesPerMessage.set(1);
    component.addFiles([
      new File(['12345'], 'big.txt', { type: 'text/plain' }),
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ]);
    expect(component['files']()).toHaveLength(1);
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'VALIDATION.FILE_TOO_BIG',
      expect.objectContaining({ appearance: 'negative' }),
    );
    expect(mockNotificationService.open).toHaveBeenCalledWith(
      'ROOMS.TOO_MANY_FILES',
      expect.objectContaining({ appearance: 'negative' }),
    );
    mockSettingsStore.attachmentsMaxFileSize.set(50 * 1024 * 1024);
    mockSettingsStore.attachmentsMaxFilesPerMessage.set(10);
  });

  it('should not create an object url for heic or an empty file type', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    component.addFiles([
      new File(['a'], 'photo.heic', { type: 'image/heic' }),
      new File(['b'], 'unknown.bin', { type: '' }),
    ]);
    expect(component['files']().map((file) => file.kind)).toEqual([
      EAttachmentKind.FILE,
      EAttachmentKind.FILE,
    ]);
    expect(component['files']().every((file) => file.previewUrl === null)).toBe(
      true,
    );
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it('ignores paste and drop when attachments are disabled or a message is being edited', () => {
    mockSettingsStore.attachmentsEnabled.set(false);
    expect(
      component.addFiles([new File(['a'], 'a.txt', { type: 'text/plain' })]),
    ).toBe(false);
    expect(component['files']()).toEqual([]);

    mockSettingsStore.attachmentsEnabled.set(true);
    fixture.componentRef.setInput('editableMessage', mockReplyMessage);
    fixture.detectChanges();
    expect(
      component.addFiles([new File(['a'], 'a.txt', { type: 'text/plain' })]),
    ).toBe(false);
    expect(component['files']()).toEqual([]);
    mockSettingsStore.attachmentsEnabled.set(true);
    fixture.componentRef.setInput('editableMessage', null);
  });

  it('sends empty content when an edited message keeps its attachments', () => {
    const attachment: IAttachment = {
      id: 'att-1',
      kind: EAttachmentKind.IMAGE,
      name: 'a.png',
      mime: 'image/png',
      size: 10,
      width: 10,
      height: 10,
      durationMs: null,
      url: '/api/v1/attachments/att-1/content',
      thumbnailUrl: null,
    };
    fixture.componentRef.setInput('editableMessage', {
      ...mockReplyMessage,
      attachments: [attachment],
    });
    fixture.detectChanges();
    component['control'].setValue('');
    const edited = vi.fn();
    component.edited.subscribe(edited);
    component.onSubmit();
    expect(edited).toHaveBeenCalledWith({
      messageId: mockReplyMessage.id,
      content: '',
    });
    fixture.componentRef.setInput('editableMessage', null);
  });

  it('stashes composer files when the chat changes', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:draft');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    component['files'].set([
      createLocalFile(new File(['a'], 'a.png', { type: 'image/png' })),
    ]);
    fixture.componentRef.setInput('draftKey', 'room:1');
    fixture.detectChanges();
    fixture.componentRef.setInput('draftKey', 'room:2');
    TestBed.flushEffects();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:draft');
  });

  it('uses a keyboard button and a file input without accept', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ChatEditorComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: mockCurrentUser }],
        }),
        { provide: SettingsStore, useValue: mockSettingsStore },
        { provide: TuiNotificationService, useValue: mockNotificationService },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: RolesStore, useValue: mockRolesStore },
        { provide: RoomsStore, useValue: mockRoomsStore },
      ],
    }).compileComponents();
    const realFixture = TestBed.createComponent(ChatEditorComponent);
    realFixture.detectChanges();
    const input = realFixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const button = input.previousElementSibling as HTMLButtonElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    expect(button.tagName).toBe('BUTTON');
    expect(input.hasAttribute('accept')).toBe(false);
    button.click();
    expect(click).toHaveBeenCalled();
  });

  describe('with CHAT_MENTIONS_ENABLED = false (DMs / user dialogs)', () => {
    it('does not open mention dropdown and submits typed text as-is', () => {
      const submitted = vi.fn();
      component.submitted.subscribe(submitted);

      component['mentionQuery'].set({ text: 'al', from: 0, to: 3 });
      expect(component.mentionOpen()).toBe(false);

      component['control'].setValue('<p>Hello @al</p>');
      component.onSubmit();

      expect(submitted).toHaveBeenCalledWith({
        content: '<p>Hello @al</p>',
        files: [],
        replyToMessage: null,
      });
    });
  });

  describe('with CHAT_MENTIONS_ENABLED = true', () => {
    let mentionFixture: ComponentFixture<ChatEditorComponent>;
    let mentionComp: ChatEditorComponent;
    let mentionStore: MockStore;

    beforeEach(async () => {
      TestBed.resetTestingModule();
      usersList.set([alice, bob]);
      usersMap.set({ 1: alice, 2: bob });
      mentionableRoles.set([adminRole]);
      rolesMap.set({ 10: adminRole });
      roomsDict.set({});

      await TestBed.configureTestingModule({
        imports: [ChatEditorComponent],
        providers: [
          provideTranslateService(),
          provideMockStore({
            selectors: [
              { selector: selectCurrentUser, value: mockCurrentUser },
            ],
          }),
          { provide: SettingsStore, useValue: mockSettingsStore },
          {
            provide: TuiNotificationService,
            useValue: mockNotificationService,
          },
          { provide: UsersStore, useValue: mockUsersStore },
          { provide: RolesStore, useValue: mockRolesStore },
          { provide: RoomsStore, useValue: mockRoomsStore },
          { provide: CHAT_MENTIONS_ENABLED, useValue: true },
        ],
      })
        .overrideComponent(ChatEditorComponent, {
          set: {
            template: '',
            providers: [],
          },
        })
        .compileComponents();

      mentionStore = TestBed.inject(MockStore);
      mentionFixture = TestBed.createComponent(ChatEditorComponent);
      mentionComp = mentionFixture.componentInstance;
      await mentionFixture.whenStable();
    });

    afterEach(() => {
      mentionStore.resetSelectors();
      TestBed.resetTestingModule();
    });

    it('filters suggestions by prefix first then substring when typing @al', () => {
      mentionComp['mentionQuery'].set({ text: 'al', from: 0, to: 3 });

      const suggestions = mentionComp['rawSuggestions']();
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].label).toBe('@alice');
      expect(suggestions[0].kind).toBe('user');
      expect(mentionComp.mentionOpen()).toBe(true);
      expect(mentionComp['suggestionVms']()[0].active).toBe(true);
    });

    it('hides roles and @everyone when currentUser lacks MENTION_EVERYONE and is not owner', () => {
      mentionStore.overrideSelector(selectCurrentUser, {
        ...mockCurrentUser,
        isOwner: false,
        permissions: [],
      });
      mentionStore.refreshState();

      mentionComp['mentionQuery'].set({ text: '', from: 0, to: 1 });
      const suggestions = mentionComp['rawSuggestions']();

      expect(suggestions.some((s) => s.kind === 'role')).toBe(false);
      expect(suggestions.some((s) => s.kind === 'everyone')).toBe(false);
      expect(suggestions.map((s) => s.label)).toEqual(['@alice', '@bob']);
    });

    it('shows roles and places @everyone last when user has MENTION_EVERYONE', () => {
      mentionStore.overrideSelector(selectCurrentUser, {
        ...mockCurrentUser,
        permissions: [EPermission.MENTION_EVERYONE],
      });
      mentionStore.refreshState();

      mentionComp['mentionQuery'].set({ text: '', from: 0, to: 1 });
      const suggestions = mentionComp['rawSuggestions']();

      expect(suggestions.some((s) => s.kind === 'role')).toBe(true);
      expect(suggestions.some((s) => s.kind === 'everyone')).toBe(true);
      const last = suggestions[suggestions.length - 1];
      expect(last.kind).toBe('everyone');
      expect(last.label).toBe('@everyone');
    });

    it('filters out users who cannot access a private room', () => {
      const privateRoom: IRoom = {
        id: 101,
        name: 'Secret',
        type: ERoomType.TEXT,
        isPrivate: true,
        allowedUserIds: [alice.id],
        allowedRoleIds: [],
        author: { id: 99, username: 'owner', fullname: 'Owner' },
        createdAt: new Date(),
        updatedAt: null,
        avatar: null,
        avatarUrl: null,
      };

      roomsDict.set({ 101: privateRoom });
      mentionFixture.componentRef.setInput('mentionRoomId', 101);

      mentionComp['mentionQuery'].set({ text: '', from: 0, to: 1 });
      const suggestions = mentionComp['rawSuggestions']();

      expect(suggestions.some((s) => s.id === alice.id)).toBe(true);
      expect(suggestions.some((s) => s.id === bob.id)).toBe(false);
    });

    it('caps suggestions to at most 8 items', () => {
      const manyUsers: IUserSafe[] = [];
      for (let i = 1; i <= 20; i++) {
        manyUsers.push({
          id: i,
          username: `user_${i}`,
          fullname: `User ${i}`,
          avatar: null,
          avatarUrl: null,
          isOwner: false,
          roles: [],
          permissions: [],
          createdAt: new Date(),
          updatedAt: null,
        });
      }
      usersList.set(manyUsers);
      mentionStore.overrideSelector(selectCurrentUser, {
        ...mockCurrentUser,
        permissions: [EPermission.MENTION_EVERYONE],
      });
      mentionStore.refreshState();

      mentionComp['mentionQuery'].set({ text: '', from: 0, to: 1 });
      const suggestions = mentionComp['rawSuggestions']();

      expect(suggestions.length).toBe(8);
      expect(suggestions[suggestions.length - 1].kind).toBe('everyone');
    });

    it('cycles activeIndex with selectNextMention and selectPreviousMention', () => {
      mentionComp['mentionQuery'].set({ text: '', from: 0, to: 1 });
      expect(mentionComp['activeIndex']()).toBe(0);

      mentionComp.selectNextMention();
      expect(mentionComp['activeIndex']()).toBe(1);

      mentionComp.selectPreviousMention();
      expect(mentionComp['activeIndex']()).toBe(0);

      mentionComp.selectPreviousMention();
      expect(mentionComp['activeIndex']()).toBe(
        mentionComp['rawSuggestions']().length - 1,
      );
    });

    it('closes suggestions when closeMentions is called', () => {
      mentionComp['mentionQuery'].set({ text: 'al', from: 0, to: 3 });
      expect(mentionComp.mentionOpen()).toBe(true);

      mentionComp.closeMentions();
      expect(mentionComp.mentionOpen()).toBe(false);
      expect(mentionComp['mentionQuery']()).toBeNull();
    });

    it('inserts mention node and clears mentionQuery on insertMention', () => {
      const chainMock = {
        focus: vi.fn().mockReturnThis(),
        insertContentAt: vi.fn().mockReturnThis(),
        run: vi.fn().mockReturnValue(true),
      };
      const mockEditor = {
        chain: vi.fn().mockReturnValue(chainMock),
      };
      mentionComp['tiptapEditor'] =
        mockEditor as unknown as import('@tiptap/core').Editor;

      mentionComp['mentionQuery'].set({ text: 'al', from: 0, to: 3 });
      const item: IMentionSuggestionVm = {
        key: 'user-1',
        kind: 'user',
        id: 1,
        label: '@alice',
        secondary: 'Alice Wonderland',
        avatar: {
          kind: 'user',
          username: 'alice',
          fullname: 'Alice',
          avatarUrl: null,
        },
        active: true,
      };

      mentionComp.insertMention(item);

      expect(chainMock.insertContentAt).toHaveBeenCalledWith(
        { from: 0, to: 3 },
        [
          {
            type: 'mention',
            attrs: { kind: 'user', id: 1, label: 'alice' },
          },
          { type: 'text', text: ' ' },
        ],
      );
      expect(mentionComp['mentionQuery']()).toBeNull();
    });

    it('serializes mention nodes to token tags on submit', () => {
      const submitted = vi.fn();
      mentionComp.submitted.subscribe(submitted);

      mentionComp['control'].setValue(
        '<p>Hello <span data-type="mention" data-kind="user" data-id="1">@alice</span> and ' +
          '<span data-type="mention" data-kind="role" data-id="10">@Admin</span> and ' +
          '<span data-type="mention" data-kind="everyone">@everyone</span></p>',
      );

      mentionComp.onSubmit();

      expect(submitted).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '<p>Hello &lt;@1&gt; and &lt;@&amp;10&gt; and @everyone</p>',
        }),
      );
    });

    it('deserializes mention tokens to mention spans when setting editableMessage', () => {
      mentionFixture.componentRef.setInput('editableMessage', {
        ...mockReplyMessage,
        content: '<p>Hi <@1> and <@&10> and <@everyone></p>',
      });
      mentionFixture.detectChanges();
      TestBed.flushEffects();

      const val = mentionComp['control'].value;
      expect(val).toContain('data-type="mention"');
      expect(val).toContain('data-id="1"');
      expect(val).toContain('@alice');
      expect(val).toContain('data-id="10"');
      expect(val).toContain('@Admin');
      expect(val).toContain('@everyone');
    });

    it('preserves draft text when usersStore updates while not editing', () => {
      mentionFixture.detectChanges();
      TestBed.flushEffects();

      mentionComp['control'].setValue('Draft message');
      expect(mentionComp['control'].value).toBe('Draft message');

      usersMap.set({
        ...usersMap(),
        1: { ...alice, fullname: 'Alice Updated' },
      });
      mentionFixture.detectChanges();
      TestBed.flushEffects();

      expect(mentionComp['control'].value).toBe('Draft message');
    });

    it('preserves user modifications to editable message when usersStore updates', () => {
      mentionFixture.componentRef.setInput('editableMessage', {
        ...mockReplyMessage,
        content: '<p>Original text</p>',
      });
      mentionFixture.detectChanges();
      TestBed.flushEffects();

      mentionComp['control'].setValue('<p>User modified text</p>');

      usersMap.set({
        ...usersMap(),
        1: { ...alice, fullname: 'Alice New Name' },
      });
      mentionFixture.detectChanges();
      TestBed.flushEffects();

      expect(mentionComp['control'].value).toBe('<p>User modified text</p>');
    });

    it('detects mention trigger from cursor position in text', () => {
      const mockEditor = {
        isActive: vi.fn().mockReturnValue(false),
        state: {
          selection: {
            empty: true,
            $from: {
              pos: 8,
              parentOffset: 8,
              marks: () => [],
              parent: {
                type: { name: 'paragraph' },
                textBetween: () => 'hello @a',
              },
            },
          },
        },
      };

      mentionComp['tiptapEditor'] =
        mockEditor as unknown as import('@tiptap/core').Editor;
      mentionComp['detectMentionTrigger']();

      expect(mentionComp['mentionQuery']()).toEqual({
        text: 'a',
        from: 6,
        to: 8,
      });
    });

    it('does not trigger mention inside codeBlock or code mark', () => {
      const mockEditor = {
        isActive: vi.fn().mockImplementation((name: string) => name === 'code'),
        state: {
          selection: {
            empty: true,
            $from: {
              pos: 8,
              parentOffset: 8,
              marks: () => [{ type: { name: 'code' } }],
              parent: {
                type: { name: 'paragraph' },
                textBetween: () => 'hello @a',
              },
            },
          },
        },
      };

      mentionComp['tiptapEditor'] =
        mockEditor as unknown as import('@tiptap/core').Editor;
      mentionComp['detectMentionTrigger']();

      expect(mentionComp['mentionQuery']()).toBeNull();
    });
  });
});
