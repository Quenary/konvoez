import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideStore, Store } from '@ngrx/store';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { authReducer } from '@features/auth/auth.reducer';
import { AuthActions } from '@features/auth/auth.actions';
import {
  ETextRoomEvent,
  EUserRole,
  ITextRoomMessage,
  IUser,
} from '@konvoez/shared';
import { TextRoomApiService } from './text-room-api.service';
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
    replyTo: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = new MockSocket();
    apiService = {
      getUnreadCounts: vi.fn(() =>
        of({
          rooms: { '10': 2 },
          direct: { '5': 3 },
          directTotal: 3,
        }),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        { provide: TextRoomApiService, useValue: apiService },
        { provide: TextRoomSocketToken, useValue: mockSocket },
      ],
    });

    ngrxStore = TestBed.inject(Store);
    store = TestBed.inject(UnreadCountsStore);
  });

  it('should start with empty unread maps', () => {
    expect(store.rooms()).toEqual({});
    expect(store.direct()).toEqual({});
    expect(store.directTotal()).toBe(0);
  });

  it('should load counts after login and reset them after logout', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    expect(apiService.getUnreadCounts).toHaveBeenCalled();
    expect(store.rooms()).toEqual({ 10: 2 });
    expect(store.direct()).toEqual({ 5: 3 });
    expect(store.directTotal()).toBe(3);
    expect(store.roomUnreadCount(10)).toBe(2);
    expect(store.directUnreadCount(5)).toBe(3);

    ngrxStore.dispatch(AuthActions.requestLogoutSuccess());
    expect(store.rooms()).toEqual({});
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
    expect(store.direct()).toEqual({ 5: 3 });
  });

  it('should zero the active chat and increment only inactive chats', () => {
    ngrxStore.dispatch(AuthActions.requestLoginSuccess({ user: currentUser }));
    store.setActiveChat({ roomId: 10, recipientId: null });

    expect(store.roomUnreadCount(10)).toBe(0);
    expect(store.activeRoomId()).toBe(10);

    store.handleNewMessage(incomingRoomMessage(), currentUser.id);
    expect(store.roomUnreadCount(10)).toBe(0);

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
    expect(store.directUnreadCount(7)).toBe(0);
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
});
