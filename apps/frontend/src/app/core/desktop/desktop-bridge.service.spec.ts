import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import {
  EDesktopCommand,
  ENotificationsEvent,
  EVoiceSessionType,
  type IKonvoezDesktopBridge,
  type TPushNotificationPayload,
} from '@konvoez/shared';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { NotificationsSocketToken } from '@core/tokens/notifications-socket.token';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { AudioService } from '@core/services/audio.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { PeerPlaybackService } from '@core/services/peer-playback.service';
import { PeerScreenAudioService } from '@core/services/peer-screen-audio.service';
import { DesktopBridgeService } from './desktop-bridge.service';

describe('DesktopBridgeService', () => {
  let socketMock: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let voiceLeaveMock: { leaveActiveVoice: ReturnType<typeof vi.fn> };
  let fakeBridge: IKonvoezDesktopBridge;
  let commandHandler:
    ((command: EDesktopCommand) => void | Promise<void>) | null = null;
  let offCommandMock: () => void;
  let isAuthorized$: BehaviorSubject<boolean>;

  beforeEach(() => {
    vi.clearAllMocks();
    commandHandler = null;
    offCommandMock = vi.fn();
    isAuthorized$ = new BehaviorSubject<boolean>(true);

    socketMock = {
      on: vi.fn(),
      off: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    voiceLeaveMock = {
      leaveActiveVoice: vi.fn().mockResolvedValue(undefined),
    };

    fakeBridge = {
      apiVersion: 1,
      platform: 'linux',
      appVersion: '0.1.0',
      notify: vi.fn(),
      setVoiceState: vi.fn(),
      onCommand: vi.fn((listener) => {
        commandHandler = listener;
        return () => {
          offCommandMock();
        };
      }),
      quitReady: vi.fn(),
    };
  });

  it('init() is a no-op when no bridge is present', () => {
    delete (window as unknown as { konvoezDesktop?: unknown }).konvoezDesktop;
    TestBed.configureTestingModule({
      providers: [
        DesktopBridgeService,
        { provide: NotificationsSocketToken, useValue: socketMock },
        { provide: VoiceLeaveService, useValue: voiceLeaveMock },
        {
          provide: Store,
          useValue: { select: vi.fn().mockReturnValue(isAuthorized$) },
        },
      ],
    });

    const service = TestBed.inject(DesktopBridgeService);
    expect(service.isDesktop).toBe(false);
    service.init();
    expect(socketMock.on).not.toHaveBeenCalled();
    expect(socketMock.connect).not.toHaveBeenCalled();
  });

  describe('with bridge present', () => {
    let service: DesktopBridgeService;
    let prefs: InstanceType<typeof VoiceAudioPreferencesStore>;
    let session: InstanceType<typeof VoiceSessionStore>;

    beforeEach(() => {
      (window as unknown as { konvoezDesktop?: unknown }).konvoezDesktop =
        fakeBridge;

      TestBed.configureTestingModule({
        providers: [
          DesktopBridgeService,
          { provide: NotificationsSocketToken, useValue: socketMock },
          { provide: VoiceLeaveService, useValue: voiceLeaveMock },
          {
            provide: Store,
            useValue: {
              select: vi.fn().mockImplementation((selector) => {
                if (selector === selectIsAuthorized) {
                  return isAuthorized$;
                }
                return new BehaviorSubject<unknown>(null);
              }),
            },
          },
          { provide: AudioService, useValue: { playMuteAudio: vi.fn() } },
          {
            provide: PeerPlaybackService,
            useValue: { applySpeakerMuted: vi.fn() },
          },
          {
            provide: PeerScreenAudioService,
            useValue: { applySpeakerMuted: vi.fn() },
          },
          {
            provide: MediasoupSessionService,
            useValue: { setMicrophoneMuted: vi.fn() },
          },
        ],
      });

      service = TestBed.inject(DesktopBridgeService);
      prefs = TestBed.inject(VoiceAudioPreferencesStore);
      session = TestBed.inject(VoiceSessionStore);
    });

    afterEach(() => {
      delete (window as unknown as { konvoezDesktop?: unknown }).konvoezDesktop;
    });

    it('syncs voice state when store toggles', async () => {
      service.init();
      TestBed.flushEffects();

      expect(fakeBridge.setVoiceState).toHaveBeenCalledWith(
        expect.objectContaining({
          inVoice: false,
          micMuted: false,
          speakerMuted: false,
        }),
      );

      prefs.setMicrophoneMuted(true);
      TestBed.flushEffects();

      expect(fakeBridge.setVoiceState).toHaveBeenCalledWith(
        expect.objectContaining({
          micMuted: true,
        }),
      );
    });

    it('manages socket connection according to auth state', () => {
      service.init();

      expect(socketMock.connect).toHaveBeenCalledTimes(1);

      isAuthorized$.next(false);
      expect(socketMock.disconnect).toHaveBeenCalledTimes(1);

      isAuthorized$.next(true);
      expect(socketMock.connect).toHaveBeenCalledTimes(2);
    });

    it('handles TOGGLE_MIC and TOGGLE_SPEAKER commands', () => {
      service.init();
      expect(fakeBridge.onCommand).toHaveBeenCalled();

      const toggleMicSpy = vi.spyOn(prefs, 'toggleMicrophoneMuted');
      const toggleSpeakerSpy = vi.spyOn(prefs, 'toggleSpeakerMuted');

      expect(commandHandler).toBeDefined();
      commandHandler?.(EDesktopCommand.TOGGLE_MIC);
      expect(toggleMicSpy).toHaveBeenCalledTimes(1);

      commandHandler?.(EDesktopCommand.TOGGLE_SPEAKER);
      expect(toggleSpeakerSpy).toHaveBeenCalledTimes(1);
    });

    it('handles QUIT_REQUESTED: leaves active voice then calls quitReady', async () => {
      session.setActiveSession({
        roomId: 1,
        type: EVoiceSessionType.GROUP_ROOM,
      });
      service.init();

      expect(commandHandler).toBeDefined();
      await commandHandler?.(EDesktopCommand.QUIT_REQUESTED);

      expect(voiceLeaveMock.leaveActiveVoice).toHaveBeenCalledTimes(1);
      expect(fakeBridge.quitReady).toHaveBeenCalledTimes(1);
    });

    it('calls quitReady even when leaveActiveVoice rejects', async () => {
      session.setActiveSession({
        roomId: 1,
        type: EVoiceSessionType.GROUP_ROOM,
      });
      voiceLeaveMock.leaveActiveVoice.mockRejectedValueOnce(
        new Error('leave failed'),
      );
      service.init();

      expect(commandHandler).toBeDefined();
      await commandHandler?.(EDesktopCommand.QUIT_REQUESTED);

      expect(voiceLeaveMock.leaveActiveVoice).toHaveBeenCalledTimes(1);
      expect(fakeBridge.quitReady).toHaveBeenCalledTimes(1);
    });

    it('passes socket notification event to bridge.notify unmodified', () => {
      service.init();

      expect(socketMock.on).toHaveBeenCalledWith(
        ENotificationsEvent.NOTIFICATION,
        expect.any(Function),
      );

      const notificationHandler = socketMock.on.mock.calls.find(
        (call) => call[0] === ENotificationsEvent.NOTIFICATION,
      )?.[1];

      const payload: TPushNotificationPayload = {
        title: 'Incoming message',
        body: 'Hello',
      };
      expect(notificationHandler).toBeDefined();
      notificationHandler?.(payload);
      expect(fakeBridge.notify).toHaveBeenCalledWith(payload);
    });
  });
});
