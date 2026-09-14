import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideStore } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { TextRoomApiService } from './text-room-api.service';
import { TextRoomStore, EMessageStatus } from './text-room.store';
import {
  ETextRoomEvent,
  ITextRoomListResponse,
  ITextRoomMessage,
} from '@konvoez/shared';
import { authReducer } from '@features/auth/auth.reducer';

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

describe('TextRoomStore', () => {
  let store: InstanceType<typeof TextRoomStore>;
  let apiService: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockSocket: MockSocket;
  let mockNotifications: { open: ReturnType<typeof vi.fn> };

  const message1: ITextRoomMessage = {
    id: 'msg-1',
    senderId: 1,
    senderUsername: 'alice',
    roomId: 10,
    recipientId: null,
    content: 'First message',
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: null,
    replyTo: null,
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
    };

    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: TextRoomApiService, useValue: apiService },
        { provide: TextRoomSocketToken, useValue: mockSocket },
        { provide: TuiNotificationService, useValue: mockNotifications },
      ],
    });

    store = TestBed.inject(TextRoomStore);
  });

  it('should initialize with default state', () => {
    expect(store.selectedRoomId()).toBeNull();
    expect(store.selectedRecipientId()).toBeNull();
    expect(store.editableMessageId()).toBeNull();
    expect(store.replyToMessageId()).toBeNull();
    expect(store.targetScrollMessageId()).toBeNull();
    expect(store.messages()).toEqual([]);
  });

  it('should handle join and populate messages from api', () => {
    store.join({ roomId: 10, recipientId: null });

    expect(store.selectedRoomId()).toBe(10);
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
  });

  it('should handle leave and clear entities and state', () => {
    store.join({ roomId: 10, recipientId: null });
    expect(store.messages().length).toBe(2);

    store.leave();

    expect(mockSocket.emit).toHaveBeenCalledWith(ETextRoomEvent.LEAVE, {});
    expect(store.selectedRoomId()).toBeNull();
    expect(store.messages()).toEqual([]);
  });

  it('should manage replyToMessageId and replyToMessage computed', () => {
    store.join({ roomId: 10, recipientId: null });

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
    store.join({ roomId: 10, recipientId: null });
    apiService.list.mockClear();

    store.jumpToMessage('msg-1');

    expect(store.targetScrollMessageId()).toBe('msg-1');
    expect(apiService.list).not.toHaveBeenCalled();
  });

  it('should fetch aroundId and scroll if jumpToMessage targets unloaded message', () => {
    store.join({ roomId: 10, recipientId: null });

    const remoteMessage: ITextRoomMessage = {
      id: 'msg-remote-99',
      senderId: 3,
      senderUsername: 'charlie',
      roomId: 10,
      recipientId: null,
      content: 'Old remote message',
      createdAt: new Date('2026-09-14T10:00:00.000Z'),
      updatedAt: null,
      replyTo: null,
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
    store.join({ roomId: 10, recipientId: null });

    apiService.list.mockReturnValue(
      of<ITextRoomListResponse>({
        items: [],
      }),
    );

    store.jumpToMessage('deleted-target-id');

    expect(mockNotifications.open).toHaveBeenCalled();
  });

  it('should create message optimistically with replyTo attachment and update on success', () => {
    store.join({ roomId: 10, recipientId: null });
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
      replyTo: {
        id: 'msg-1',
        senderId: 1,
        senderUsername: 'alice',
        content: 'First message',
        isDeleted: false,
      },
    };
    apiService.create.mockReturnValue(of(createdServerMessage));

    store.createMessage({
      tempId: 'temp-123',
      data: {
        content: 'New message replying to 1',
        roomId: 10,
        recipientId: null,
        replyToId: 'msg-1',
      },
    });

    expect(store.replyToMessageId()).toBeNull();
    expect(apiService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'New message replying to 1',
        replyToId: 'msg-1',
      }),
    );
    expect(store.entityMap()['msg-created-real']).toBeTruthy();
    expect(store.entityMap()['msg-created-real'].status).toBe(
      EMessageStatus.SUCCESS,
    );
    expect(store.entityMap()['msg-created-real'].replyTo?.id).toBe('msg-1');
  });

  it('should update replies to isDeleted: true when original message is deleted via socket', () => {
    store.join({ roomId: 10, recipientId: null });
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
    store.join({ roomId: 10, recipientId: null });
    store.setEditableMessageId('msg-1');

    const updatedMessage: ITextRoomMessage = {
      ...message1,
      content: 'Updated content',
      updatedAt: new Date('2026-09-15T00:10:00.000Z'),
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
});
