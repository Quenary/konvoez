import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { ChatApiService } from '@core/api/chat-api.service';
import { AttachmentsApiService } from '@core/chat/outgoing/attachments-api.service';
import { MessageReadQueueService } from '@core/chat/message-read-queue.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { ChatStore, EMessageStatus } from './chat.store';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import {
  ETextRoomEvent,
  EUserRole,
  ITextRoomListResponse,
  ITextRoomMessage,
  IUser,
} from '@konvoez/shared';
import { authReducer } from '@core/auth/auth.reducer';
import { AuthActions } from '@core/auth/auth.actions';

class MockSocket {
  private readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();

  connect = vi.fn();
  disconnect = vi.fn();

  on(event: string, handler: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(handler);
    return this;
  }

  off(event: string, handler: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  emit = vi.fn((event: string, ...args: unknown[]) => {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((h) => h(...args));
    }
    return true;
  });
}

describe('ChatStore', () => {
  let store: InstanceType<typeof ChatStore>;
  let ngrxStore: Store;
  let apiService: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    toggleReaction: ReturnType<typeof vi.fn>;
  };
  let mockSocket: MockSocket;
  let mockNotifications: { open: ReturnType<typeof vi.fn> };
  let unreadCountsStore: {
    setActiveChat: ReturnType<typeof vi.fn>;
    clearActiveChat: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
  };
  let messageReadQueueService: {
    reset: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
  };

  const currentUser: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: null,
  };

  const message1: ITextRoomMessage = {
    id: 'msg-1',
    senderId: 1,
    senderUsername: 'alice',
    roomId: 10,
    recipientId: null,
    content: 'First message',
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: null,
    isRead: false,
    attachments: [],
    clientId: null,
    replyTo: null,
    reactions: [],
  };

  const message2WithReply: ITextRoomMessage = {
    id: 'msg-2',
    senderId: 2,
    senderUsername: 'bob',
    roomId: 10,
    recipientId: null,
    content: 'Second replying message',
    createdAt: new Date('2026-09-15T00:01:00.000Z'),
    updatedAt: null,
    isRead: false,
    attachments: [],
    clientId: null,
    reactions: [],
    replyTo: {
      id: 'msg-1',
      senderId: 1,
      senderUsername: 'alice',
      content: 'First message',
      isDeleted: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = new MockSocket();
    mockNotifications = {
      open: vi.fn(() => of(undefined)),
    };

    apiService = {
      list: vi.fn(() =>
        of<ITextRoomListResponse>({
          items: [message1, message2WithReply],
        }),
      ),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(() => of(null)),
      toggleReaction: vi.fn(() => of([])),
    };
    unreadCountsStore = {
      setActiveChat: vi.fn(),
      clearActiveChat: vi.fn(),
      load: vi.fn(),
    };
    messageReadQueueService = {
      reset: vi.fn(),
      enqueue: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatStore,
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: ChatApiService, useValue: apiService },
        {
          provide: AttachmentsApiService,
          useValue: { upload: vi.fn(), delete: vi.fn(() => of(undefined)) },
        },
        { provide: TextRoomSocketToken, useValue: mockSocket },
        { provide: TuiNotificationService, useValue: mockNotifications },
        { provide: UnreadCountsStore, useValue: unreadCountsStore },
        { provide: MessageReadQueueService, useValue: messageReadQueueService },
      ],
    });

    store = TestBed.inject(ChatStore);
    ngrxStore = TestBed.inject(Store);
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
  });

  it('should initialize with default state', () => {
    expect(store.target()).toBeNull();
    expect(store.editableMessageId()).toBeNull();
    expect(store.replyToMessageId()).toBeNull();
    expect(store.targetScrollMessageId()).toBeNull();
    expect(store.messages()).toEqual([]);
  });

  it('should handle join and populate messages from api', () => {
    store.join({ kind: 'room', id: 10 });

    expect(store.target()).toEqual({ kind: 'room', id: 10 });
    expect(mockSocket.emit).toHaveBeenCalledWith(ETextRoomEvent.JOIN, {
      roomId: 10,
      recipientId: null,
    });
    expect(apiService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 10,
        recipientId: null,
        limit: 25,
      }),
    );
    expect(store.messages().length).toBe(2);
    expect(store.newestId()).toBe('msg-2');
    expect(store.oldestId()).toBe('msg-1');
    expect(unreadCountsStore.setActiveChat).toHaveBeenCalledWith({
      roomId: 10,
      recipientId: null,
    });
    expect(messageReadQueueService.reset).toHaveBeenCalled();
  });

  it('should handle leave and clear entities and state', () => {
    store.join({ kind: 'room', id: 10 });
    expect(store.messages().length).toBe(2);

    store.leave();

    expect(mockSocket.emit).toHaveBeenCalledWith(ETextRoomEvent.LEAVE, {});
    expect(store.target()).toBeNull();
    expect(store.messages()).toEqual([]);
    expect(unreadCountsStore.clearActiveChat).toHaveBeenCalled();
    expect(unreadCountsStore.load).toHaveBeenCalled();
    expect(messageReadQueueService.reset).toHaveBeenCalled();
  });

  it('should manage replyToMessageId and replyToMessage computed', () => {
    store.join({ kind: 'room', id: 10 });

    store.setReplyToMessageId('msg-1');
    expect(store.replyToMessageId()).toBe('msg-1');
    expect(store.replyToMessage()?.id).toBe('msg-1');

    // Setting editableMessageId should clear replyToMessageId
    store.setEditableMessageId('msg-2');
    expect(store.editableMessageId()).toBe('msg-2');
    expect(store.replyToMessageId()).toBeNull();
    expect(store.editableMessage()?.id).toBe('msg-2');

    // Setting replyToMessageId should clear editableMessageId
    store.setReplyToMessageId('msg-1');
    expect(store.editableMessageId()).toBeNull();
    expect(store.replyToMessageId()).toBe('msg-1');
  });

  it('should jumpToMessage directly if message is already loaded', () => {
    store.join({ kind: 'room', id: 10 });
    apiService.list.mockClear();

    store.jumpToMessage('msg-1');

    expect(store.targetScrollMessageId()).toBe('msg-1');
    expect(apiService.list).not.toHaveBeenCalled();
  });

  it('should fetch aroundId and scroll if jumpToMessage targets unloaded message', () => {
    store.join({ kind: 'room', id: 10 });

    const remoteMessage: ITextRoomMessage = {
      id: 'msg-remote-99',
      senderId: 3,
      senderUsername: 'charlie',
      roomId: 10,
      recipientId: null,
      content: 'Old remote message',
      createdAt: new Date('2026-09-14T10:00:00.000Z'),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: null,
      replyTo: null,
      reactions: [],
    };

    apiService.list.mockReturnValue(
      of<ITextRoomListResponse>({
        items: [remoteMessage],
      }),
    );

    store.jumpToMessage('msg-remote-99');

    expect(apiService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 10,
        aroundId: 'msg-remote-99',
      }),
    );
    expect(store.targetScrollMessageId()).toBe('msg-remote-99');
    expect(store.entityMap()['msg-remote-99']).toBeTruthy();
  });

  it('should show notification if jumpToMessage target was deleted on server', () => {
    store.join({ kind: 'room', id: 10 });

    apiService.list.mockReturnValue(
      of<ITextRoomListResponse>({
        items: [],
      }),
    );

    store.jumpToMessage('deleted-target-id');

    expect(mockNotifications.open).toHaveBeenCalled();
  });

  it('should create message optimistically with replyTo attachment and update on success', () => {
    store.join({ kind: 'room', id: 10 });
    store.setReplyToMessageId('msg-1');

    const createdServerMessage: ITextRoomMessage = {
      id: 'msg-created-real',
      senderId: 1,
      senderUsername: 'alice',
      roomId: 10,
      recipientId: null,
      content: 'New message replying to 1',
      createdAt: new Date('2026-09-15T00:05:00.000Z'),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: 'temp-123',
      reactions: [],
      replyTo: {
        id: 'msg-1',
        senderId: 1,
        senderUsername: 'alice',
        content: 'First message',
        isDeleted: false,
      },
    };
    const create$ = new Subject<ITextRoomMessage>();
    apiService.create.mockReturnValue(create$.asObservable());

    store.createMessage({
      tempId: 'temp-123',
      data: {
        content: 'New message replying to 1',
        roomId: 10,
        recipientId: null,
        replyToId: 'msg-1',
        attachmentIds: [],
      },
    });

    expect(store.replyToMessageId()).toBeNull();
    expect(apiService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'New message replying to 1',
        replyToId: 'msg-1',
        clientId: 'temp-123',
      }),
    );
    const pending = store.messages().find((item) => item.id === 'temp-123');
    expect(pending?.status).toBe(EMessageStatus.LOADING);
    expect(pending?.isPendingCreate).toBe(true);
    expect(pending?.senderId).toBe(currentUser.id);
    expect(pending?.senderUsername).toBe(currentUser.username);
    expect(pending?.replyTo?.id).toBe('msg-1');
    expect(store.entityMap()['temp-123']).toBeUndefined();
    expect(store.newestId()).toBe('msg-2');

    create$.next(createdServerMessage);
    create$.complete();

    expect(store.entityMap()['temp-123']).toBeUndefined();
    expect(store.entityMap()['msg-created-real']).toBeTruthy();
    expect(store.entityMap()['msg-created-real'].status).toBe(
      EMessageStatus.SUCCESS,
    );
    expect(store.entityMap()['msg-created-real'].isPendingCreate).toBeFalsy();
    expect(store.entityMap()['msg-created-real'].replyTo?.id).toBe('msg-1');
  });

  it('should retry failed pending create message', () => {
    store.join({ kind: 'room', id: 10 });

    const create$ = new Subject<ITextRoomMessage>();
    apiService.create.mockReturnValue(create$.asObservable());

    store.createMessage({
      tempId: 'temp-retry',
      data: {
        content: 'Retry me',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
    });

    create$.error(new Error('network'));
    expect(
      store.messages().find((item) => item.id === 'temp-retry')?.status,
    ).toBe(EMessageStatus.ERROR);
    expect(
      store.messages().find((item) => item.id === 'temp-retry')
        ?.isPendingCreate,
    ).toBe(true);

    const retry$ = new Subject<ITextRoomMessage>();
    apiService.create.mockReturnValue(retry$.asObservable());
    apiService.create.mockClear();

    store.retryMessage('temp-retry');

    expect(
      store.messages().find((item) => item.id === 'temp-retry')?.status,
    ).toBe(EMessageStatus.LOADING);
    expect(apiService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Retry me',
        roomId: 10,
        recipientId: null,
        replyToId: null,
        clientId: 'temp-retry',
      }),
    );

    retry$.next({
      id: 'msg-retried',
      senderId: 1,
      senderUsername: 'alice',
      roomId: 10,
      recipientId: null,
      content: 'Retry me',
      createdAt: new Date('2026-09-15T00:06:00.000Z'),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: 'temp-retry',
      replyTo: null,
      reactions: [],
    });
    retry$.complete();

    expect(store.entityMap()['temp-retry']).toBeUndefined();
    expect(store.entityMap()['msg-retried']).toBeTruthy();
  });

  it('should update replies to isDeleted: true when original message is deleted via socket', () => {
    store.join({ kind: 'room', id: 10 });
    expect(store.entityMap()['msg-1']).toBeTruthy();
    expect(store.entityMap()['msg-2']?.replyTo?.isDeleted).toBe(false);

    // Socket broadcasts MESSAGE_DELETED for msg-1
    mockSocket.emit(ETextRoomEvent.MESSAGE_DELETED, { id: 'msg-1' });

    // msg-1 is removed
    expect(store.entityMap()['msg-1']).toBeUndefined();
    // msg-2 still exists, but its reply is marked as isDeleted: true
    const msg2 = store.entityMap()['msg-2'];
    expect(msg2).toBeTruthy();
    expect(msg2.replyTo?.isDeleted).toBe(true);
    expect(msg2.replyTo?.content).toBeNull();
  });

  it('should handle updateMessage and deleteMessage', () => {
    store.join({ kind: 'room', id: 10 });
    store.setEditableMessageId('msg-1');

    const updatedMessage: ITextRoomMessage = {
      ...message1,
      content: 'Updated content',
      updatedAt: new Date('2026-09-15T00:10:00.000Z'),
      isRead: false,
      attachments: [],
      clientId: null,
    };
    apiService.update.mockReturnValue(of(updatedMessage));

    store.updateMessage({
      messageId: 'msg-1',
      data: { content: 'Updated content' },
    });

    expect(apiService.update).toHaveBeenCalledWith('msg-1', {
      content: 'Updated content',
    });
    expect(store.editableMessageId()).toBeNull();
    expect(store.entityMap()['msg-1'].content).toBe('Updated content');

    store.deleteMessage('msg-1');
    expect(apiService.delete).toHaveBeenCalledWith('msg-1');
    expect(store.entityMap()['msg-1']).toBeUndefined();
  });

  describe('Search features', () => {
    it('should set search query, clear entities and reload list with search param', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.list.mockClear();

      store.setSearchQuery('hello');

      expect(store.searchQuery()).toBe('hello');
      expect(store.isSearchActive()).toBe(true);
      expect(apiService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 10,
          search: 'hello',
          afterId: null,
          beforeId: null,
        }),
      );
    });

    it('should ignore setSearchQuery if query has not changed', () => {
      store.join({ kind: 'room', id: 10 });
      store.setSearchQuery('test');
      apiService.list.mockClear();

      store.setSearchQuery('test');
      expect(apiService.list).not.toHaveBeenCalled();
    });

    it('should handle setSearchOpen and reload when closed with active query', () => {
      store.join({ kind: 'room', id: 10 });
      store.setSearchOpen(true);
      expect(store.isSearchOpen()).toBe(true);

      store.setSearchQuery('active query');
      apiService.list.mockClear();

      // Close search dialog
      store.setSearchOpen(false);
      expect(store.isSearchOpen()).toBe(false);
      expect(store.searchQuery()).toBeNull();
      expect(store.isSearchActive()).toBe(false);
      expect(apiService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 10,
        }),
      );
      expect(apiService.list.mock.calls[0][0].search).toBeUndefined();
    });

    it('should clear search and reload regular list', () => {
      store.join({ kind: 'room', id: 10 });
      store.setSearchQuery('findme');
      apiService.list.mockClear();

      store.clearSearch();
      expect(store.searchQuery()).toBeNull();
      expect(store.isSearchActive()).toBe(false);
      expect(apiService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 10,
        }),
      );
      expect(apiService.list.mock.calls[0][0].search).toBeUndefined();
    });
  });

  describe('Socket message creation & search isolation', () => {
    it('should append new message from socket when search is inactive', () => {
      store.join({ kind: 'room', id: 10 });

      const newSocketMessage: ITextRoomMessage = {
        id: 'msg-socket-new',
        senderId: 4,
        senderUsername: 'david',
        roomId: 10,
        recipientId: null,
        content: 'Brand new chat message',
        createdAt: new Date('2026-09-15T00:15:00.000Z'),
        updatedAt: null,
        isRead: false,
        attachments: [],
        clientId: null,
        replyTo: null,
        reactions: [],
      };

      mockSocket.emit(ETextRoomEvent.MESSAGE_CREATED, newSocketMessage);
      expect(store.entityMap()['msg-socket-new']).toBeTruthy();
    });

    it('should ignore new message from socket when search is active', () => {
      store.join({ kind: 'room', id: 10 });
      store.setSearchQuery('specific search');

      const incomingIrrelevantMessage: ITextRoomMessage = {
        id: 'msg-socket-irrelevant',
        senderId: 4,
        senderUsername: 'david',
        roomId: 10,
        recipientId: null,
        content: 'Unrelated message arriving right now',
        createdAt: new Date('2026-09-15T00:16:00.000Z'),
        updatedAt: null,
        isRead: false,
        attachments: [],
        clientId: null,
        replyTo: null,
        reactions: [],
      };

      mockSocket.emit(
        ETextRoomEvent.MESSAGE_CREATED,
        incomingIrrelevantMessage,
      );
      expect(store.entityMap()['msg-socket-irrelevant']).toBeUndefined();
    });

    it('should update message from socket on MESSAGE_EDITED', () => {
      store.join({ kind: 'room', id: 10 });

      const editedMessage: ITextRoomMessage = {
        ...message1,
        content: 'Edited via socket event',
        updatedAt: new Date('2026-09-15T00:20:00.000Z'),
        isRead: false,
        attachments: [],
        clientId: null,
      };

      mockSocket.emit(ETextRoomEvent.MESSAGE_EDITED, editedMessage);
      expect(store.entityMap()['msg-1'].content).toBe(
        'Edited via socket event',
      );
    });

    it('should ignore socket messages that do not belong to the active chat', () => {
      store.join({ kind: 'room', id: 10 });
      const initialMessageCount = store.messages().length;

      const directMessage: ITextRoomMessage = {
        id: 'msg-direct-incoming',
        senderId: 99,
        senderUsername: 'eve',
        roomId: null,
        recipientId: 1,
        content: 'Private message',
        createdAt: new Date('2026-09-15T00:17:00.000Z'),
        updatedAt: null,
        isRead: false,
        attachments: [],
        clientId: null,
        replyTo: null,
        reactions: [],
      };

      mockSocket.emit(ETextRoomEvent.MESSAGE_CREATED, directMessage);
      expect(store.messages().length).toBe(initialMessageCount);
      expect(store.entityMap()['msg-direct-incoming']).toBeUndefined();

      const otherRoomMessage: ITextRoomMessage = {
        id: 'msg-other-room',
        senderId: 2,
        senderUsername: 'bob',
        roomId: 11,
        recipientId: null,
        content: 'Message from another room',
        createdAt: new Date('2026-09-15T00:18:00.000Z'),
        updatedAt: null,
        isRead: false,
        attachments: [],
        clientId: null,
        replyTo: null,
        reactions: [],
      };

      mockSocket.emit(ETextRoomEvent.MESSAGE_CREATED, otherRoomMessage);
      expect(store.messages().length).toBe(initialMessageCount);
      expect(store.entityMap()['msg-other-room']).toBeUndefined();
    });

    it('should append direct message from socket when direct chat is active', () => {
      store.join({ kind: 'direct', id: 99 });

      const directMessage: ITextRoomMessage = {
        id: 'msg-direct-active',
        senderId: 99,
        senderUsername: 'eve',
        roomId: null,
        recipientId: 1,
        content: 'Private message in active chat',
        createdAt: new Date('2026-09-15T00:19:00.000Z'),
        updatedAt: null,
        isRead: false,
        attachments: [],
        clientId: null,
        replyTo: null,
        reactions: [],
      };

      mockSocket.emit(ETextRoomEvent.MESSAGE_CREATED, directMessage);
      expect(store.entityMap()['msg-direct-active']).toBeTruthy();
    });
  });

  describe('Pagination', () => {
    it('should request next page using newestId', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.list.mockClear();

      store.requestNextPage();
      expect(apiService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 10,
          afterId: 'msg-2',
        }),
      );
    });

    it('should not request next page if store is empty', () => {
      apiService.list.mockClear();
      store.requestNextPage();
      expect(apiService.list).not.toHaveBeenCalled();
    });

    it('should request prev page using oldestId', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.list.mockClear();

      store.requestPrevPage();
      expect(apiService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 10,
          beforeId: 'msg-1',
        }),
      );
    });

    it('should not request prev page if store is empty', () => {
      apiService.list.mockClear();
      store.requestPrevPage();
      expect(apiService.list).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should mark optimistic message with ERROR status and show notification on create failure', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.create.mockReturnValue(
        throwError(() => new Error('Server create error')),
      );

      store.createMessage({
        tempId: 'temp-err',
        data: {
          content: 'Failing message',
          roomId: 10,
          recipientId: null,
          replyToId: null,
          attachmentIds: [],
        },
      });

      expect(
        store.messages().find((item) => item.id === 'temp-err')?.status,
      ).toBe(EMessageStatus.ERROR);
      expect(
        store.messages().find((item) => item.id === 'temp-err')?.senderId,
      ).toBe(currentUser.id);
      expect(store.entityMap()['temp-err']).toBeUndefined();
      expect(mockNotifications.open).toHaveBeenCalled();
    });

    it('should mark message with ERROR status and show notification on update failure', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.update.mockReturnValue(
        throwError(() => new Error('Server update error')),
      );

      store.updateMessage({
        messageId: 'msg-1',
        data: { content: 'Failing update' },
      });

      expect(store.entityMap()['msg-1'].status).toBe(EMessageStatus.ERROR);
      expect(mockNotifications.open).toHaveBeenCalled();
    });

    it('should mark message with ERROR status and show notification on delete failure', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.delete.mockReturnValue(
        throwError(() => new Error('Server delete error')),
      );

      store.deleteMessage('msg-1');

      expect(store.entityMap()['msg-1'].status).toBe(EMessageStatus.ERROR);
      expect(mockNotifications.open).toHaveBeenCalled();
    });

    it('should show notification on list load failure', () => {
      apiService.list.mockReturnValue(
        throwError(() => new Error('List failed')),
      );

      store.join({ kind: 'room', id: 10 });
      expect(mockNotifications.open).toHaveBeenCalled();
    });
  });

  describe('Scroll and direct chat', () => {
    it('should set target scroll message id', () => {
      store.setTargetScrollMessageId('msg-test-scroll');
      expect(store.targetScrollMessageId()).toBe('msg-test-scroll');
    });

    it('should join direct message chat with recipientId', () => {
      store.join({ kind: 'direct', id: 99 });
      expect(store.target()).toEqual({ kind: 'direct', id: 99 });
      expect(mockSocket.emit).toHaveBeenCalledWith(ETextRoomEvent.JOIN, {
        roomId: null,
        recipientId: 99,
      });
      expect(apiService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 99,
          roomId: null,
        }),
      );
    });
  });

  describe('outgoing messages', () => {
    function sendOutgoing(tempId: string, roomId: number | null): void {
      apiService.create.mockReturnValue(new Subject());
      TestBed.inject(OutgoingMessagesStore).send({
        tempId,
        data: {
          content: 'draft',
          roomId,
          recipientId: null,
          replyToId: null,
          attachmentIds: [],
        },
        replyTo: null,
        files: [],
      });
    }

    it('shows an outgoing message only in its own chat and hides it during search', () => {
      store.join({ kind: 'room', id: 10 });
      sendOutgoing('other-room', 11);
      expect(
        store.messages().some((message) => message.id === 'other-room'),
      ).toBe(false);
      sendOutgoing('this-room', 10);
      expect(
        store.messages().some((message) => message.id === 'this-room'),
      ).toBe(true);
      expect(store.newestId()).toBe('msg-2');
      expect(store.oldestId()).toBe('msg-1');

      store.setSearchQuery('First');
      expect(store.messages().some((message) => message.outgoing)).toBe(false);
    });

    it('hides an outgoing row once the server message with the same clientId arrives', () => {
      store.join({ kind: 'room', id: 10 });
      sendOutgoing('temp-dup', 10);
      mockSocket.emit(ETextRoomEvent.MESSAGE_CREATED, {
        ...message1,
        id: 'msg-server',
        clientId: 'temp-dup',
        content: 'draft',
      });
      expect(
        store.messages().some((message) => message.id === 'temp-dup'),
      ).toBe(false);
      expect(
        store.messages().some((message) => message.id === 'msg-server'),
      ).toBe(true);
    });

    it('resolves an outgoing message from a socket echo outside the open chat and during search', () => {
      const outgoing = TestBed.inject(OutgoingMessagesStore);
      const resolve = vi.spyOn(outgoing, 'resolve');
      store.join({ kind: 'room', id: 10 });
      store.setSearchQuery('First');
      mockSocket.emit(ETextRoomEvent.MESSAGE_CREATED, {
        ...message1,
        id: 'msg-elsewhere',
        roomId: 99,
        clientId: 'temp-elsewhere',
      });
      expect(resolve).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'temp-elsewhere' }),
      );
    });
  });

  describe('Reactions', () => {
    it('should optimistically update reactions and call apiService.toggleReaction', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.toggleReaction.mockReturnValue(
        of([{ emoji: '👍', count: 1, userIds: [1] }]),
      );

      store.toggleReaction({ messageId: 'msg-1', emoji: '👍' });

      expect(apiService.toggleReaction).toHaveBeenCalledWith('msg-1', '👍');
      expect(store.entityMap()['msg-1'].reactions).toEqual([
        { emoji: '👍', count: 1, userIds: [1] },
      ]);
    });

    it('should roll back reactions when apiService.toggleReaction fails', () => {
      store.join({ kind: 'room', id: 10 });
      apiService.toggleReaction.mockReturnValue(
        throwError(() => new Error('Server error')),
      );

      store.toggleReaction({ messageId: 'msg-1', emoji: '👍' });

      expect(apiService.toggleReaction).toHaveBeenCalledWith('msg-1', '👍');
      expect(store.entityMap()['msg-1'].reactions).toEqual([]);
    });

    it('should update reactions when MESSAGE_REACTION_UPDATED event is received', () => {
      store.join({ kind: 'room', id: 10 });

      mockSocket.emit(ETextRoomEvent.MESSAGE_REACTION_UPDATED, {
        messageId: 'msg-1',
        roomId: 10,
        recipientId: null,
        reactions: [{ emoji: '🔥', count: 2, userIds: [1, 2] }],
      });

      expect(store.entityMap()['msg-1'].reactions).toEqual([
        { emoji: '🔥', count: 2, userIds: [1, 2] },
      ]);
    });
  });
});
