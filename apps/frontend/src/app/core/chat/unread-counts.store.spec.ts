import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { provideStore, Store } from '@ngrx/store';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { authReducer } from '@core/auth/auth.reducer';
import { AuthActions } from '@core/auth/auth.actions';
import {
  ETextRoomEvent,
  ITextRoomMessage,
  IUserSafe,
  IUserFull,
} from '@konvoez/shared';
import { ChatApiService } from '@core/api/chat-api.service';
import { UnreadCountsStore } from './unread-counts.store';

class MockSocket {
  private readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();

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
    this.listeners.get(event)?.forEach((handler) => handler(...args));
    return true;
  });
}

describe('UnreadCountsStore', () => {
  let store: InstanceType<typeof UnreadCountsStore>;
  let ngrxStore: Store;
  let apiService: { getUnreadCounts: ReturnType<typeof vi.fn> };
  let mockSocket: MockSocket;

  const currentUser: IUserFull = {
    id: 1,
    username: 'alice',
    email: 'test@example.com',
    fullname: 'Alice',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: null,
    twoFactorEnabled: false,
  };

  const incomingRoomMessage = (
    overrides: Partial<ITextRoomMessage> = {},
  ): ITextRoomMessage => ({
    id: '00000000-0000-7000-8000-000000000001',
    senderId: 2,
    senderUsername: 'bob',
    roomId: 10,
    recipientId: null,
    content: 'hello',
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: null,
    isRead: false,
    attachments: [],
    clientId: null,
    replyTo: null,
    reactions: [],
    mentions: { userIds: [], roleIds: [], everyone: false },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = new MockSocket();
    apiService = {
      getUnreadCounts: vi.fn(() =>
        of({
          rooms: { '10': 2 },
          roomMentions: { '10': 1 },
          direct: { '5': 3 },
          directTotal: 3,
        }),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        { provide: ChatApiService, useValue: apiService },
        { provide: TextRoomSocketToken, useValue: mockSocket },
        UnreadCountsStore,
      ],
    });

    ngrxStore = TestBed.inject(Store);
    store = TestBed.inject(UnreadCountsStore);
  });

  afterEach(() => {
    ngrxStore.dispatch(AuthActions.requestLogoutSuccess());
    TestBed.resetTestingModule();
  });

  it('should start with empty unread maps', () => {
    expect(store.rooms()).toEqual({});
    expect(store.roomMentions()).toEqual({});
    expect(store.direct()).toEqual({});
    expect(store.directTotal()).toBe(0);
    expect(store.roomMentionCount(10)).toBe(0);
  });

  it('should load counts after login and reset them after logout', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    expect(apiService.getUnreadCounts).toHaveBeenCalled();
    expect(store.rooms()).toEqual({ 10: 2 });
    expect(store.roomMentions()).toEqual({ 10: 1 });
    expect(store.direct()).toEqual({ 5: 3 });
    expect(store.directTotal()).toBe(3);
    expect(store.roomUnreadCount(10)).toBe(2);
    expect(store.roomMentionCount(10)).toBe(1);
    expect(store.directUnreadCount(5)).toBe(3);

    ngrxStore.dispatch(AuthActions.requestLogoutSuccess());
    expect(store.rooms()).toEqual({});
    expect(store.roomMentions()).toEqual({});
    expect(store.direct()).toEqual({});
    expect(store.activeRoomId()).toBeNull();
    expect(store.activeRecipientId()).toBeNull();
  });

  it('should keep previous counts when load fails', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    apiService.getUnreadCounts.mockReturnValue(
      throwError(() => new Error('network')),
    );

    store.load();

    expect(store.rooms()).toEqual({ 10: 2 });
    expect(store.roomMentions()).toEqual({ 10: 1 });
    expect(store.direct()).toEqual({ 5: 3 });
  });

  it('should keep active chat counts and increment on new messages', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    store.setActiveChat({ roomId: 10, recipientId: null });

    expect(store.roomUnreadCount(10)).toBe(2);
    expect(store.roomMentionCount(10)).toBe(1);
    expect(store.activeRoomId()).toBe(10);

    store.handleNewMessage(incomingRoomMessage(), currentUser.id);
    expect(store.roomUnreadCount(10)).toBe(3);

    store.handleNewMessage(
      incomingRoomMessage({
        id: '00000000-0000-7000-8000-000000000002',
        roomId: 11,
      }),
      currentUser.id,
    );
    expect(store.roomUnreadCount(11)).toBe(1);

    store.handleNewMessage(
      incomingRoomMessage({
        id: '00000000-0000-7000-8000-000000000003',
        senderId: currentUser.id,
        roomId: 11,
      }),
      currentUser.id,
    );
    expect(store.roomUnreadCount(11)).toBe(1);
  });

  it('should increment direct unread only for incoming messages from another user', () => {
    store.setActiveChat({ roomId: null, recipientId: 7 });

    store.handleNewMessage(
      incomingRoomMessage({
        roomId: null,
        recipientId: currentUser.id,
        senderId: 8,
      }),
      currentUser.id,
    );
    expect(store.directUnreadCount(8)).toBe(1);
    expect(store.directTotal()).toBe(1);

    store.handleNewMessage(
      incomingRoomMessage({
        id: '00000000-0000-7000-8000-000000000004',
        roomId: null,
        recipientId: currentUser.id,
        senderId: 7,
      }),
      currentUser.id,
    );
    expect(store.directUnreadCount(7)).toBe(1);
    expect(store.directTotal()).toBe(2);
  });

  it('should not increment direct unread for self messages', () => {
    store.handleNewMessage(
      incomingRoomMessage({
        roomId: null,
        recipientId: currentUser.id,
        senderId: currentUser.id,
      }),
      currentUser.id,
    );
    expect(store.directUnreadCount(currentUser.id)).toBe(0);
    expect(store.directTotal()).toBe(0);
  });

  it('should increment from socket MESSAGE_CREATED when authorized', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    mockSocket.emit(
      ETextRoomEvent.MESSAGE_CREATED,
      incomingRoomMessage({ roomId: 22 }),
    );

    expect(store.roomUnreadCount(22)).toBe(1);
  });

  it('should clear active chat without wiping unread maps', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    store.setActiveChat({ roomId: 10, recipientId: null });
    store.clearActiveChat();

    expect(store.activeRoomId()).toBeNull();
    expect(store.activeRecipientId()).toBeNull();
    expect(store.direct()).toEqual({ 5: 3 });
  });

  it('should track unread mentions when incoming message mentions user', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    expect(store.roomMentionCount(10)).toBe(1);

    // Active room keeps count updated
    store.setActiveChat({ roomId: 10, recipientId: null });
    expect(store.roomMentionCount(10)).toBe(1);

    store.handleNewMessage(
      incomingRoomMessage({
        id: 'msg-mention-1',
        roomId: 10,
        mentions: { userIds: [currentUser.id], roleIds: [], everyone: false },
      }),
      currentUser,
    );
    expect(store.roomMentionCount(10)).toBe(2);

    // Inactive room increments mention count
    store.handleNewMessage(
      incomingRoomMessage({
        id: 'msg-mention-2',
        roomId: 11,
        mentions: { userIds: [currentUser.id], roleIds: [], everyone: false },
      }),
      currentUser,
    );
    expect(store.roomMentionCount(11)).toBe(1);

    // Message without mention increments only rooms count, not mention count
    store.handleNewMessage(
      incomingRoomMessage({
        id: 'msg-mention-3',
        roomId: 11,
        mentions: { userIds: [99], roleIds: [], everyone: false },
      }),
      currentUser,
    );
    expect(store.roomUnreadCount(11)).toBe(2);
    expect(store.roomMentionCount(11)).toBe(1);

    // Message mentioning role increments mention count if user has role
    const userWithRole: IUserSafe = {
      ...currentUser,
      roles: [{ id: 42, name: 'Moderator', priority: 1, mentionable: true }],
    };
    store.handleNewMessage(
      incomingRoomMessage({
        id: 'msg-mention-4',
        roomId: 11,
        mentions: { userIds: [], roleIds: [42], everyone: false },
      }),
      userWithRole,
    );
    expect(store.roomMentionCount(11)).toBe(2);

    // Message with @everyone increments mention count
    store.handleNewMessage(
      incomingRoomMessage({
        id: 'msg-mention-5',
        roomId: 11,
        mentions: { userIds: [], roleIds: [], everyone: true },
      }),
      currentUser,
    );
    expect(store.roomMentionCount(11)).toBe(3);

    // Setting active chat preserves counts
    store.setActiveChat({ roomId: 11, recipientId: null });
    expect(store.roomMentionCount(11)).toBe(3);
  });

  it('should apply counts directly via applyCounts and query via chatUnreadCount', () => {
    store.applyCounts({
      rooms: { '20': 5 },
      roomMentions: { '20': 2 },
      direct: { '9': 4 },
      directTotal: 4,
    });

    expect(store.rooms()).toEqual({ 20: 5 });
    expect(store.roomMentions()).toEqual({ 20: 2 });
    expect(store.direct()).toEqual({ 9: 4 });
    expect(store.directTotal()).toBe(4);
    expect(store.chatUnreadCount({ kind: 'room', id: 20 })).toBe(5);
    expect(store.chatUnreadCount({ kind: 'direct', id: 9 })).toBe(4);
    expect(store.chatUnreadCount({ roomId: 20 })).toBe(5);
    expect(store.chatUnreadCount({ recipientId: 9 })).toBe(4);
    expect(store.chatUnreadCount(null)).toBe(0);
  });

  it('should update counts on UNREAD_COUNTS_CHANGED socket event', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));

    mockSocket.emit(ETextRoomEvent.UNREAD_COUNTS_CHANGED, {
      rooms: { '10': 0, '15': 2 },
      roomMentions: {},
      direct: { '3': 1 },
      directTotal: 1,
    });

    expect(store.rooms()).toEqual({ 10: 0, 15: 2 });
    expect(store.direct()).toEqual({ 3: 1 });
  });

  it('should compute activeChatUnreadCount for active room and active DM', () => {
    store.applyCounts({
      rooms: { '10': 3 },
      roomMentions: {},
      direct: { '5': 4 },
      directTotal: 4,
    });

    expect(store.activeChatUnreadCount()).toBe(0);

    store.setActiveChat({ roomId: 10, recipientId: null });
    expect(store.activeChatUnreadCount()).toBe(3);

    store.setActiveChat({ roomId: null, recipientId: 5 });
    expect(store.activeChatUnreadCount()).toBe(4);

    store.clearActiveChat();
    expect(store.activeChatUnreadCount()).toBe(0);
  });
});
