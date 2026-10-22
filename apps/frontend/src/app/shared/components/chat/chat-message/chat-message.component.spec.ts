import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageComponent } from './chat-message.component';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { ChatStore, EMessageStatus, IMessageEntity } from '../chat.store';
import { UsersStore } from '@core/stores/users.store';
import { TuiNotificationService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { computed, signal, Sanitizer } from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authReducer } from '@core/auth/auth.reducer';
import { AuthActions } from '@core/auth/auth.actions';
import { EPermission, IUser } from '@konvoez/shared';
import { ChatApiService } from '@core/api/chat-api.service';
import { MessageReadQueueService } from '@core/chat/message-read-queue.service';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import { IOutgoingMessage } from '@core/chat/outgoing/outgoing.types';
import { RolesStore } from '@core/stores/roles.store';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';

describe('ChatMessageComponent', () => {
  let component: ChatMessageComponent;
  let fixture: ComponentFixture<ChatMessageComponent>;

  const uploadProgress = signal<Record<string, number>>({});

  const mockChatStore = {
    setReplyToMessageId: vi.fn(),
    setEditableMessageId: vi.fn(),
    deleteMessage: vi.fn(),
    jumpToMessage: vi.fn(),
    retryMessage: vi.fn(),
    cancelOutgoing: vi.fn(),
    removeOutgoingFile: vi.fn(),
    toggleReaction: vi.fn(),
  };

  const mockUsersStore = {
    entityMap: signal({}),
  };

  const mockRolesStore = {
    rolesById: signal({}),
  };

  const mockUserDialogService = {
    open: vi.fn(),
  };

  const mockNotificationService = {
    open: vi.fn(() => of(undefined)),
  };
  const mockDialogService = {
    open: vi.fn(() => of(undefined)),
  };
  const mockChatApi = {
    getReaders: vi.fn(() => of<IUser[]>([])),
    markRead: vi.fn(() => of(undefined)),
  };
  const currentUser: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: null,
  };

  const testMessage: IMessageEntity = {
    id: 'msg-1',
    content: '<p>Hello world</p>',
    senderId: 1,
    senderUsername: 'alice',
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

  beforeEach(async () => {
    vi.clearAllMocks();
    uploadProgress.set({});
    mockUsersStore.entityMap.set({});

    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    }

    await TestBed.configureTestingModule({
      imports: [ChatMessageComponent],
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        {
          provide: Sanitizer,
          useValue: {
            sanitize: vi.fn((_ctx: unknown, val: string | null) => val ?? ''),
          },
        },
        { provide: ChatStore, useValue: mockChatStore },
        {
          provide: OutgoingMessagesStore,
          useValue: { uploadProgress },
        },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: RolesStore, useValue: mockRolesStore },
        { provide: UserDialogService, useValue: mockUserDialogService },
        { provide: TuiNotificationService, useValue: mockNotificationService },
        {
          provide: TuiResponsiveDialogService,
          useValue: mockDialogService,
        },
        { provide: ChatApiService, useValue: mockChatApi },
        {
          provide: MessageReadQueueService,
          useValue: { enqueue: vi.fn(), reset: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatMessageComponent);
    fixture.componentRef.setInput('message', testMessage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sanitize HTML message content', () => {
    fixture.componentRef.setInput('message', {
      ...testMessage,
      content: '<p>test</p><script>alert(1)</script>',
    });
    fixture.detectChanges();
    // sanitizedContent is a computed signal
    expect(component['sanitizedContent']()).toBeTruthy();
  });

  it('should set reply target when replyMessage is called', () => {
    component['replyMessage']();
    expect(mockChatStore.setReplyToMessageId).toHaveBeenCalledWith('msg-1');
  });

  it('should set editable message when editMessage is called', () => {
    component['editMessage']();
    expect(mockChatStore.setEditableMessageId).toHaveBeenCalledWith('msg-1');
  });

  it('should delete message when deleteMessage is called', () => {
    component['deleteMessage']();
    expect(mockChatStore.deleteMessage).toHaveBeenCalledWith('msg-1');
  });

  it('should jump to target message on quote click when not deleted', () => {
    const reply = {
      id: 'target-1',
      senderId: 2,
      senderUsername: 'bob',
      content: 'hi',
      isDeleted: false,
    };
    component['onReplyQuoteClick'](reply);
    expect(mockChatStore.jumpToMessage).toHaveBeenCalledWith('target-1');
  });

  it('should show notification on quote click when original message is deleted', () => {
    const reply = {
      id: 'target-2',
      senderId: null,
      senderUsername: null,
      content: null,
      isDeleted: true,
    };
    component['onReplyQuoteClick'](reply);
    expect(mockNotificationService.open).toHaveBeenCalled();
    expect(mockChatStore.jumpToMessage).not.toHaveBeenCalled();
  });

  it('should expose sent and read status only for own messages', () => {
    expect(component['readStatus']()).toBeNull();

    TestBed.inject(Store).dispatch(
      AuthActions.requestLoginSuccess({ user: currentUser }),
    );
    fixture.detectChanges();
    expect(component['readStatus']()).toBe('sent');

    fixture.componentRef.setInput('message', { ...testMessage, isRead: true });
    fixture.detectChanges();
    expect(component['readStatus']()).toBe('read');
  });

  it('should show loading status and allow resend for failed pending create', () => {
    TestBed.inject(Store).dispatch(
      AuthActions.requestLoginSuccess({ user: currentUser }),
    );

    fixture.componentRef.setInput('message', {
      ...testMessage,
      status: EMessageStatus.LOADING,
      isPendingCreate: true,
    });
    fixture.detectChanges();
    expect(component['readStatus']()).toBe('loading');
    expect(component['canResend']()).toBe(false);

    fixture.componentRef.setInput('message', {
      ...testMessage,
      status: EMessageStatus.ERROR,
      isPendingCreate: true,
    });
    fixture.detectChanges();
    expect(component['readStatus']()).toBe('error');
    expect(component['canResend']()).toBe(true);

    component['resendMessage']();
    expect(mockChatStore.retryMessage).toHaveBeenCalledWith('msg-1');
  });

  it('does not reread upload progress for a server message', () => {
    fixture.detectChanges();
    let runs = 0;
    const watched = computed(() => {
      runs += 1;
      return component['progress']();
    });
    expect(watched()).toEqual({});
    expect(runs).toBe(1);
    uploadProgress.set({ file: 0.4 });
    expect(watched()).toEqual({});
    expect(runs).toBe(1);
  });

  it('offers cancel only while an outgoing send can still be stopped', () => {
    const outgoing = (
      phase: IOutgoingMessage['state']['phase'],
    ): IOutgoingMessage => ({
      tempId: 'msg-1',
      data: {
        content: '<p>Hello world</p>',
        roomId: 1,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      createdAt: testMessage.createdAt,
      files: [],
      state: phase === 'failed' ? { phase, reason: 'upload' } : { phase },
    });
    fixture.componentRef.setInput('message', {
      ...testMessage,
      outgoing: outgoing('uploading'),
    });
    fixture.detectChanges();
    expect(component['canCancelSending']()).toBe(true);
    fixture.componentRef.setInput('message', {
      ...testMessage,
      outgoing: outgoing('failed'),
    });
    fixture.detectChanges();
    expect(component['canCancelSending']()).toBe(true);
    fixture.componentRef.setInput('message', {
      ...testMessage,
      outgoing: outgoing('creating'),
    });
    fixture.detectChanges();
    expect(component['canCancelSending']()).toBe(false);
  });

  it('renders attachments before text and hides an empty body', () => {
    fixture.componentRef.setInput('message', {
      ...testMessage,
      attachments: [
        {
          id: 'att-1',
          kind: 'FILE',
          name: 'a.txt',
          mime: 'text/plain',
          size: 1,
          width: null,
          height: null,
          durationMs: null,
          url: '/api/v1/attachments/att-1/content',
          thumbnailUrl: null,
        },
      ],
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const attachments = root.querySelector('app-chat-message-attachments');
    const text = root.querySelector('tui-editor-socket');
    if (!attachments || !text) {
      throw new Error('attachments and text should both render');
    }
    expect(
      attachments.compareDocumentPosition(text) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    fixture.componentRef.setInput('message', { ...testMessage, content: '' });
    fixture.detectChanges();
    expect(root.querySelector('tui-editor-socket')).toBeNull();
  });

  it('should load readers and open the dialog', () => {
    const readers = [{ ...currentUser, id: 2, username: 'bob' }];
    mockChatApi.getReaders.mockReturnValue(of(readers));

    component['showReadersDialog']('tmpl');

    expect(mockChatApi.getReaders).toHaveBeenCalledWith('msg-1');
    expect(component['readers']()).toEqual(readers);
    expect(mockDialogService.open).toHaveBeenCalled();
  });

  it('should stop loading readers when the request fails', () => {
    mockChatApi.getReaders.mockReturnValue(throwError(() => new Error('fail')));

    component['showReadersDialog']('tmpl');

    expect(component['readersLoading']()).toBe(false);
  });

  describe('canDelete', () => {
    const otherMessage: IMessageEntity = {
      ...testMessage,
      id: 'msg-2',
      senderId: 2,
      senderUsername: 'bob',
    };

    function loginWith(overrides: Partial<IUser> = {}): void {
      TestBed.inject(Store).dispatch(
        AuthActions.requestLoginSuccess({
          user: { ...currentUser, ...overrides },
        }),
      );
      fixture.detectChanges();
    }

    it('should hide delete when there is no current user', () => {
      fixture.componentRef.setInput('message', otherMessage);
      fixture.detectChanges();
      expect(component['canDelete']()).toBe(false);
    });

    it('should allow deleting own messages in a room and in a direct chat', () => {
      loginWith();
      expect(component['canDelete']()).toBe(true);

      fixture.componentRef.setInput('message', {
        ...testMessage,
        roomId: null,
        recipientId: 2,
      });
      fixture.detectChanges();
      expect(component['canDelete']()).toBe(true);
    });

    it.each([
      { isOwner: true, permissions: [] },
      { isOwner: false, permissions: [EPermission.MODERATE_MESSAGES] },
    ])(
      'should let privileged user delete another user room message',
      (overrides) => {
        loginWith(overrides);
        fixture.componentRef.setInput('message', otherMessage);
        fixture.detectChanges();
        expect(component['canDelete']()).toBe(true);
      },
    );

    it('should hide delete of another user room message for a normal member', () => {
      loginWith({ isOwner: false, permissions: [] });
      fixture.componentRef.setInput('message', otherMessage);
      fixture.detectChanges();
      expect(component['canDelete']()).toBe(false);
    });

    it.each([
      { isOwner: true, permissions: [] },
      { isOwner: false, permissions: [EPermission.MODERATE_MESSAGES] },
      { isOwner: false, permissions: [] },
    ])('should hide delete of another user direct message', (overrides) => {
      loginWith(overrides);
      fixture.componentRef.setInput('message', {
        ...otherMessage,
        roomId: null,
        recipientId: currentUser.id,
      });
      fixture.detectChanges();
      expect(component['canDelete']()).toBe(false);
    });
  });

  describe('sender display from UsersStore', () => {
    const otherUser: IUser = {
      id: 2,
      username: 'bob-new',
      fullname: 'Bob New',
      email: 'bob@example.com',
      isOwner: false,
      roles: [],
      permissions: [],
      avatar: 'avatar-key',
      avatarUrl: '/api/v1/users/avatar/stream?key=avatar-key',
      createdAt: new Date('2026-01-02'),
      updatedAt: null,
    };

    const otherMessage: IMessageEntity = {
      ...testMessage,
      id: 'msg-2',
      senderId: 2,
      senderUsername: 'bob-old',
    };

    it('should fall back to message.senderUsername when user is not in UsersStore', () => {
      fixture.componentRef.setInput('message', otherMessage);
      fixture.detectChanges();

      expect(component['senderUser']()).toBeNull();
      expect(component['senderUsername']()).toBe('bob-old');
      expect(component['senderFullnameHint']()).toBeNull();
      expect(component['avatarUrl']()).toBeNull();
    });

    it('should prefer UsersStore username and avatar over denormalized message fields', () => {
      mockUsersStore.entityMap.set({ [otherUser.id]: otherUser });
      fixture.componentRef.setInput('message', otherMessage);
      fixture.detectChanges();

      expect(component['senderUser']()).toEqual(otherUser);
      expect(component['senderUsername']()).toBe('bob-new');
      expect(component['senderFullnameHint']()).toBe('Bob New');
      expect(component['avatarUrl']()).toBe(otherUser.avatarUrl);
    });

    it('should refresh senderUsername when UsersStore entity is updated', () => {
      mockUsersStore.entityMap.set({ [otherUser.id]: otherUser });
      fixture.componentRef.setInput('message', otherMessage);
      fixture.detectChanges();
      expect(component['senderUsername']()).toBe('bob-new');

      mockUsersStore.entityMap.set({
        [otherUser.id]: { ...otherUser, username: 'bob-renamed' },
      });
      fixture.detectChanges();

      expect(component['senderUsername']()).toBe('bob-renamed');
      expect(component['senderUsername']()).not.toBe(
        otherMessage.senderUsername,
      );
    });

    it('should resolve own sender from currentUser when missing in UsersStore', () => {
      TestBed.inject(Store).dispatch(
        AuthActions.requestLoginSuccess({
          user: {
            ...currentUser,
            username: 'alice-live',
            fullname: 'Alice Live',
            avatarUrl: '/api/v1/users/avatar/stream?key=alice',
          },
        }),
      );
      fixture.componentRef.setInput('message', {
        ...testMessage,
        senderUsername: 'alice-stale',
      });
      fixture.detectChanges();

      expect(component['senderUsername']()).toBe('alice-live');
      expect(component['senderFullnameHint']()).toBe('Alice Live');
      expect(component['avatarUrl']()).toBe(
        '/api/v1/users/avatar/stream?key=alice',
      );
    });

    it('should omit fullname hint when it matches username', () => {
      mockUsersStore.entityMap.set({
        [otherUser.id]: {
          ...otherUser,
          username: 'bob',
          fullname: 'bob',
        },
      });
      fixture.componentRef.setInput('message', otherMessage);
      fixture.detectChanges();

      expect(component['senderUsername']()).toBe('bob');
      expect(component['senderFullnameHint']()).toBeNull();
    });
  });

  describe('reactions', () => {
    it('should invoke toggleReaction on chatStore when onReactionSelect is called', () => {
      component['onReactionSelect']('👍');

      expect(mockChatStore.toggleReaction).toHaveBeenCalledWith({
        messageId: 'msg-1',
        emoji: '👍',
      });
    });

    it('should render reactions component with message reactions', () => {
      fixture.componentRef.setInput('message', {
        ...testMessage,
        reactions: [{ emoji: '👍', count: 1, userIds: [1] }],
      });
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const reactionsEl = el.querySelector('app-chat-message-reactions');
      expect(reactionsEl).not.toBeNull();
    });
  });

  describe('mentions', () => {
    it('renders plain text unchanged in DMs without app-mention-chip', () => {
      fixture.componentRef.setInput('message', {
        ...testMessage,
        roomId: null,
        recipientId: 2,
        content: '<p>Hi <@1></p>',
      });
      fixture.detectChanges();

      expect(component['isRoomMessage']()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('app-mention-chip'),
      ).toBeFalsy();
      expect(fixture.nativeElement.textContent).toContain('<@1>');
    });

    it('escapes username containing HTML in mention chip', () => {
      mockUsersStore.entityMap.set({
        1: { ...currentUser, username: '<img src=x onerror=alert(1)>' },
      });
      fixture.componentRef.setInput('message', {
        ...testMessage,
        roomId: 1,
        recipientId: null,
        content: '<p>Hi <@1></p>',
      });
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector('app-mention-chip');
      expect(chip).toBeTruthy();
      expect(fixture.nativeElement.querySelector('img[onerror]')).toBeFalsy();
      expect(chip.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('sets mention-chip-me and info appearance only for mentions of current user', () => {
      const bobUser: IUser = { ...currentUser, id: 2, username: 'bob' };
      mockUsersStore.entityMap.set({
        1: currentUser,
        2: bobUser,
      });

      const store = TestBed.inject(Store);
      store.dispatch(AuthActions.initEnd({ user: currentUser }));

      fixture.componentRef.setInput('message', {
        ...testMessage,
        senderId: 2,
        roomId: 1,
        content: '<p><@1> and <@2></p>',
        mentions: { userIds: [1], roleIds: [], everyone: false },
      });
      fixture.detectChanges();

      const chips = fixture.nativeElement.querySelectorAll('app-mention-chip');
      expect(chips.length).toBe(2);
      expect(chips[0].classList.contains('mention-chip-me')).toBe(true);
      expect(chips[1].classList.contains('mention-chip-me')).toBe(false);
    });

    it('does not set mention-chip-me when @everyone is not in accepted mentions and message is not mentioned', () => {
      const store = TestBed.inject(Store);
      store.dispatch(AuthActions.initEnd({ user: currentUser }));

      fixture.componentRef.setInput('message', {
        ...testMessage,
        senderId: 2,
        roomId: 1,
        content: '<p>@everyone</p>',
        mentions: { userIds: [], roleIds: [], everyone: false },
      });
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector('app-mention-chip');
      expect(chip).toBeTruthy();
      expect(chip.classList.contains('mention-chip-me')).toBe(false);
    });

    it('sets mention-chip-me when @everyone is accepted', () => {
      const store = TestBed.inject(Store);
      store.dispatch(AuthActions.initEnd({ user: currentUser }));

      fixture.componentRef.setInput('message', {
        ...testMessage,
        senderId: 2,
        roomId: 1,
        content: '<p>@everyone</p>',
        mentions: { userIds: [], roleIds: [], everyone: true },
      });
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector('app-mention-chip');
      expect(chip).toBeTruthy();
      expect(chip.classList.contains('mention-chip-me')).toBe(true);
    });

    it('does not set mention-chip-me on own message even if message contains mentions', () => {
      const store = TestBed.inject(Store);
      store.dispatch(AuthActions.initEnd({ user: currentUser }));

      fixture.componentRef.setInput('message', {
        ...testMessage,
        senderId: 1,
        roomId: 1,
        content: '<p><@1> and @everyone</p>',
        mentions: { userIds: [1], roleIds: [], everyone: true },
      });
      fixture.detectChanges();

      const chips = fixture.nativeElement.querySelectorAll('app-mention-chip');
      expect(chips.length).toBe(2);
      expect(chips[0].classList.contains('mention-chip-me')).toBe(false);
      expect(chips[1].classList.contains('mention-chip-me')).toBe(false);
    });

    it('opens user dialog when clicking a user mention chip', () => {
      mockUsersStore.entityMap.set({ 1: currentUser });
      fixture.componentRef.setInput('message', {
        ...testMessage,
        roomId: 1,
        content: '<p><@1></p>',
      });
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector(
        'app-mention-chip[data-kind="user"]',
      );
      expect(chip).toBeTruthy();
      chip.click();

      expect(mockUserDialogService.open).toHaveBeenCalledWith(currentUser);
    });
  });
});
