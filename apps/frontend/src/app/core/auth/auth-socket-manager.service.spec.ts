import { EventEmitter } from 'events';
import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { DesktopBridgeService } from '@core/desktop/desktop-bridge.service';
import { EntitySyncSocketToken } from '@core/tokens/entity-sync-socket.token';
import { NotificationsSocketToken } from '@core/tokens/notifications-socket.token';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { VoiceRoomSocketToken } from '@core/tokens/voice-room-socket.token';
import { AuthApiService } from '@core/api/auth-api.service';
import { of, throwError } from 'rxjs';
import { TokenRefreshService } from './token-refresh.service';
import { AuthSocketManager } from './auth-socket-manager.service';

type FakeSocket = EventEmitter & {
  connected: boolean;
  connect: Mock;
  disconnect: Mock;
};

const makeSocket = (): FakeSocket => {
  const socket: FakeSocket = Object.assign(new EventEmitter(), {
    connected: false,
    connect: vi.fn(() => {
      socket.connected = true;
      socket.emit('connect');
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  });
  return socket;
};

describe('AuthSocketManager', () => {
  let store: MockStore;
  let voice: FakeSocket;
  let text: FakeSocket;
  let sync: FakeSocket;
  let notifications: FakeSocket;
  let authApi: { refresh: Mock };

  beforeEach(() => {
    vi.useFakeTimers();
    voice = makeSocket();
    text = makeSocket();
    sync = makeSocket();
    notifications = makeSocket();
    authApi = { refresh: vi.fn(() => of(undefined)) };

    TestBed.configureTestingModule({
      providers: [
        provideMockStore({
          selectors: [{ selector: selectIsAuthorized, value: false }],
        }),
        AuthSocketManager,
        TokenRefreshService,
        { provide: AuthApiService, useValue: authApi },
        { provide: VoiceRoomSocketToken, useValue: voice },
        { provide: TextRoomSocketToken, useValue: text },
        { provide: EntitySyncSocketToken, useValue: sync },
        { provide: NotificationsSocketToken, useValue: notifications },
        { provide: DesktopBridgeService, useValue: { isDesktop: true } },
      ],
    });

    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    vi.useRealTimers();
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  const startAuthorized = (): AuthSocketManager => {
    const manager = TestBed.inject(AuthSocketManager);
    manager.start();
    store.overrideSelector(selectIsAuthorized, true);
    store.refreshState();
    return manager;
  };

  describe('when not desktop', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideMockStore({
            selectors: [{ selector: selectIsAuthorized, value: false }],
          }),
          AuthSocketManager,
          { provide: VoiceRoomSocketToken, useValue: voice },
          { provide: TextRoomSocketToken, useValue: text },
          { provide: EntitySyncSocketToken, useValue: sync },
          { provide: NotificationsSocketToken, useValue: notifications },
          TokenRefreshService,
          { provide: AuthApiService, useValue: authApi },
          { provide: DesktopBridgeService, useValue: { isDesktop: false } },
        ],
      });
      store = TestBed.inject(MockStore);
    });

    it('connects voice, text, and sync but not notifications', () => {
      const manager = TestBed.inject(AuthSocketManager);
      manager.start();
      store.overrideSelector(selectIsAuthorized, true);
      store.refreshState();

      expect(voice.connect).toHaveBeenCalledTimes(1);
      expect(text.connect).toHaveBeenCalledTimes(1);
      expect(sync.connect).toHaveBeenCalledTimes(1);
      expect(notifications.connect).not.toHaveBeenCalled();
    });
  });

  it('reconnects after io server disconnect with refresh', async () => {
    startAuthorized();
    voice.connected = true;

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;

    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(voice.connect).toHaveBeenCalledTimes(2);
  });

  it('backs off reconnect delays and resets on connect', async () => {
    startAuthorized();
    voice.connected = true;
    voice.connect.mockImplementation(() => {
      voice.connected = true;
    });

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(2);

    voice.emit('connect');
    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(3);
  });

  it('single-flights refresh when two sockets drop together', async () => {
    startAuthorized();
    voice.connected = true;
    text.connected = true;

    voice.emit('disconnect', 'io server disconnect');
    text.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    text.connected = false;

    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect when refresh fails', async () => {
    authApi.refresh.mockReturnValue(throwError(() => new Error('401')));
    startAuthorized();
    voice.connected = true;

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    const connectCalls = voice.connect.mock.calls.length;

    await vi.advanceTimersByTimeAsync(1000);
    expect(voice.connect.mock.calls.length).toBe(connectCalls);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(voice.connect.mock.calls.length).toBe(connectCalls);
  });

  it('resets reconnect backoff after logout and login', async () => {
    startAuthorized();
    voice.connected = true;
    voice.connect.mockImplementation(() => {
      voice.connected = true;
    });

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(2);

    store.overrideSelector(selectIsAuthorized, false);
    store.refreshState();
    store.overrideSelector(selectIsAuthorized, true);
    store.refreshState();

    authApi.refresh.mockClear();
    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears pending reconnect on logout', async () => {
    startAuthorized();
    voice.connected = true;
    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;

    store.overrideSelector(selectIsAuthorized, false);
    store.refreshState();

    const connectCalls = voice.connect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(voice.connect.mock.calls.length).toBe(connectCalls);
    expect(authApi.refresh).not.toHaveBeenCalled();
  });

  it('ignores client-initiated disconnect reasons', async () => {
    startAuthorized();
    voice.connected = true;

    voice.emit('disconnect', 'io client disconnect');
    voice.emit('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(authApi.refresh).not.toHaveBeenCalled();
  });
});
