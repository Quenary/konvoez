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
import { delay, of, Subject, throwError } from 'rxjs';
import { ESocketEvent } from '@konvoez/shared';
import {
  AppResumeService,
  type IAppResume,
} from '@core/services/app-resume.service';
import { TokenRefreshService } from './token-refresh.service';
import { AuthSocketManager } from './auth-socket-manager.service';

type FakeSocket = EventEmitter & {
  connected: boolean;
  connect: Mock;
  disconnect: Mock;
  emitWithAck: Mock;
  timeout: Mock;
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
    emitWithAck: vi.fn(() => Promise.resolve({})),
    timeout: vi.fn(() => socket),
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
  let resume$: Subject<IAppResume>;

  beforeEach(() => {
    resume$ = new Subject<IAppResume>();
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
        { provide: AppResumeService, useValue: { resume$ } },
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

  it('backs off when the server accepts then immediately disconnects', async () => {
    startAuthorized();
    voice.connected = true;
    authApi.refresh.mockClear();

    voice.connect.mockImplementation(() => {
      voice.connected = true;
      voice.emit('connect');
      voice.connected = false;
      voice.emit('disconnect', 'io server disconnect');
    });

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;

    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(authApi.refresh).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(4000);
    expect(authApi.refresh).toHaveBeenCalledTimes(3);
  });

  it('resets backoff after a stable connection', async () => {
    startAuthorized();
    voice.connected = true;
    authApi.refresh.mockClear();

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);

    voice.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    authApi.refresh.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);

    authApi.refresh.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).not.toHaveBeenCalled();
  });

  it('single-flights refresh when two sockets drop together', async () => {
    authApi.refresh.mockReturnValue(of(undefined).pipe(delay(100)));

    startAuthorized();
    voice.connected = true;
    text.connected = true;
    const voiceConnectsBefore = voice.connect.mock.calls.length;
    const textConnectsBefore = text.connect.mock.calls.length;

    voice.emit('disconnect', 'io server disconnect');
    text.emit('disconnect', 'io server disconnect');
    voice.connected = false;
    text.connected = false;

    await vi.advanceTimersByTimeAsync(1000);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(voice.connect.mock.calls.length).toBe(voiceConnectsBefore + 1);
    expect(text.connect.mock.calls.length).toBe(textConnectsBefore + 1);
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

  describe('on resume', () => {
    it('pings connected sockets and keeps the ones that answer', async () => {
      startAuthorized();
      voice.disconnect.mockClear();

      resume$.next({ sleptMs: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(voice.emitWithAck).toHaveBeenCalledWith(ESocketEvent.PING);
      expect(voice.disconnect).not.toHaveBeenCalled();
      expect(voice.connect).toHaveBeenCalledTimes(1);
    });

    it('recycles a socket that does not answer the ping', async () => {
      startAuthorized();
      voice.disconnect.mockClear();
      text.disconnect.mockClear();
      voice.emitWithAck.mockRejectedValueOnce(new Error('timeout'));

      resume$.next({ sleptMs: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(voice.disconnect).toHaveBeenCalledTimes(1);
      expect(voice.connect).toHaveBeenCalledTimes(2);
      expect(text.disconnect).not.toHaveBeenCalled();
    });

    it('reconnects a dropped socket immediately with a token refresh', async () => {
      startAuthorized();
      authApi.refresh.mockClear();
      voice.emit('disconnect', 'io server disconnect');
      voice.connected = false;

      resume$.next({ sleptMs: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(authApi.refresh).toHaveBeenCalledTimes(1);
      expect(voice.connect).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(voice.connect).toHaveBeenCalledTimes(2);
    });

    it('ignores resume while unauthorized', async () => {
      TestBed.inject(AuthSocketManager).start();

      resume$.next({ sleptMs: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(voice.emitWithAck).not.toHaveBeenCalled();
      expect(voice.connect).not.toHaveBeenCalled();
    });
  });
});
