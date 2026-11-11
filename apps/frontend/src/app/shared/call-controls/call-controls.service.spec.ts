import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceQualityService } from '@core/services/voice-quality.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { RoomNavigationService } from '@features/rooms/room-navigation.service';
import {
  EVoiceConnectionState,
  EVoiceQualityTier,
  EVoiceSessionType,
  IRoom,
  IUserSafe,
  TVoiceSessionTarget,
} from '@konvoez/shared';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallControlsService } from './call-controls.service';

describe('CallControlsService', () => {
  let service: CallControlsService;
  let translate: TranslateService;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let roomNavigationService: { selectRoom: ReturnType<typeof vi.fn> };
  let voiceLeaveService: { leaveFromVoiceUi: ReturnType<typeof vi.fn> };
  let voiceSessionService: {
    stopCamera: ReturnType<typeof vi.fn>;
    stopScreen: ReturnType<typeof vi.fn>;
  };
  let toggleMicrophoneMuted: ReturnType<typeof vi.fn>;
  let toggleSpeakerMuted: ReturnType<typeof vi.fn>;

  let roomsDict: ReturnType<typeof signal<Record<number, IRoom>>>;
  let activeSession: ReturnType<typeof signal<TVoiceSessionTarget | null>>;
  let microphoneMuted: ReturnType<typeof signal<boolean>>;
  let speakerMuted: ReturnType<typeof signal<boolean>>;
  let isDirectCallContext: ReturnType<typeof signal<boolean>>;
  let isConnected: ReturnType<typeof signal<boolean>>;
  let callWithUserId: ReturnType<typeof signal<number | null>>;
  let interlocutor: ReturnType<typeof signal<IUserSafe | null>>;
  let qualityTier: ReturnType<typeof signal<EVoiceQualityTier>>;
  let qualityBitrateKbps: ReturnType<typeof signal<number>>;
  let connectionState: ReturnType<typeof signal<EVoiceConnectionState | null>>;
  let audioSuspended: ReturnType<typeof signal<boolean>>;

  const user = {
    fullname: 'Bob Smith',
    username: 'bob',
  } as IUserSafe;

  beforeEach(() => {
    router = { navigate: vi.fn().mockResolvedValue(true) };
    roomNavigationService = { selectRoom: vi.fn() };
    voiceLeaveService = {
      leaveFromVoiceUi: vi.fn().mockResolvedValue(undefined),
    };
    voiceSessionService = {
      stopCamera: vi.fn().mockResolvedValue(undefined),
      stopScreen: vi.fn().mockResolvedValue(undefined),
    };
    toggleMicrophoneMuted = vi.fn();
    toggleSpeakerMuted = vi.fn();

    roomsDict = signal({});
    activeSession = signal(null);
    microphoneMuted = signal(false);
    speakerMuted = signal(false);
    isDirectCallContext = signal(false);
    isConnected = signal(false);
    callWithUserId = signal(null);
    interlocutor = signal(null);
    qualityTier = signal(EVoiceQualityTier.EXCELLENT);
    qualityBitrateKbps = signal(64);
    connectionState = signal<EVoiceConnectionState | null>(null);
    audioSuspended = signal(false);

    TestBed.configureTestingModule({
      providers: [
        CallControlsService,
        provideTranslateService(),
        { provide: Router, useValue: router },
        { provide: RoomNavigationService, useValue: roomNavigationService },
        { provide: VoiceLeaveService, useValue: voiceLeaveService },
        { provide: VoiceSessionService, useValue: voiceSessionService },
        {
          provide: VoiceQualityService,
          useValue: {
            tier: qualityTier.asReadonly(),
            bitrateKbps: qualityBitrateKbps.asReadonly(),
          },
        },
        {
          provide: VoiceConnectionStore,
          useValue: {
            state: connectionState.asReadonly(),
            audioSuspended: audioSuspended.asReadonly(),
          },
        },
        {
          provide: RoomsStore,
          useValue: { roomsDict: roomsDict.asReadonly() },
        },
        {
          provide: VoiceSessionStore,
          useValue: { activeSession: activeSession.asReadonly() },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: microphoneMuted.asReadonly(),
            speakerMuted: speakerMuted.asReadonly(),
            toggleMicrophoneMuted,
            toggleSpeakerMuted,
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            isDirectCallContext: isDirectCallContext.asReadonly(),
            isConnected: isConnected.asReadonly(),
            callWithUserId: callWithUserId.asReadonly(),
            interlocutor: interlocutor.asReadonly(),
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: signal<MediaStreamTrack | null>(null),
            localScreenTrack: signal<MediaStreamTrack | null>(null),
          },
        },
      ],
    });

    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      CALL: {
        DIRECT_CALL: 'Direct Call',
        QUALITY: {
          LEVEL_0: 'Voice quality: excellent. {{kbps}} kbps',
          LEVEL_1: 'Voice quality: good. {{kbps}} kbps',
          LEVEL_2: 'Voice quality: degraded. {{kbps}} kbps',
          LEVEL_3: 'Voice quality: poor. {{kbps}} kbps',
        },
        CONNECTION: {
          AUDIO_SUSPENDED: 'Audio suspended',
          RECONNECTING: 'Reconnecting',
          DISCONNECTED: 'Disconnected',
          DEAD: 'Connection lost',
        },
      },
    });
    translate.setTranslation('ru', {
      CALL: {
        DIRECT_CALL: 'Прямой звонок',
        QUALITY: {
          LEVEL_0: 'Связь: отличная. {{kbps}} кбит/с',
          LEVEL_3: 'Связь: плохая. {{kbps}} кбит/с',
        },
      },
    });
    translate.use('en');

    service = TestBed.inject(CallControlsService);
  });

  it('uses the interlocutor name, then username, then the direct-call label', () => {
    isDirectCallContext.set(true);
    interlocutor.set(user);
    expect(service.sessionTitle()).toBe('Bob Smith');

    interlocutor.set({ ...user, fullname: '' });
    expect(service.sessionTitle()).toBe('bob');

    interlocutor.set(null);
    expect(service.sessionTitle()).toBe('Direct Call');

    translate.use('ru');
    expect(service.sessionTitle()).toBe('Прямой звонок');
  });

  it('uses the room name for a group session and stays empty without one', () => {
    expect(service.sessionTitle()).toBe('');

    const room = { id: 10, name: 'General Voice' } as IRoom;
    roomsDict.set({ 10: room });
    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 10,
    });
    expect(service.sessionTitle()).toBe('General Voice');

    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 99,
    });
    expect(service.sessionTitle()).toBe('');
  });

  it('prefers the direct-call title over a group room', () => {
    roomsDict.set({ 10: { id: 10, name: 'General Voice' } as IRoom });
    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 10,
    });
    isDirectCallContext.set(true);
    interlocutor.set(user);

    expect(service.sessionTitle()).toBe('Bob Smith');
  });

  it('is active when a session exists or a direct call is connected', () => {
    expect(service.isSessionActive()).toBe(false);

    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    expect(service.isSessionActive()).toBe(true);

    activeSession.set(null);
    isConnected.set(true);
    expect(service.isSessionActive()).toBe(true);
  });

  it.each([
    {
      state: null,
      tier: EVoiceQualityTier.EXCELLENT,
      suspended: false,
      color: 'var(--tui-status-positive)',
      text: 'Voice quality: excellent. 64 kbps',
    },
    {
      state: EVoiceConnectionState.CONNECTED,
      tier: EVoiceQualityTier.GOOD,
      suspended: false,
      color: 'var(--tui-status-info)',
      text: 'Voice quality: good. 64 kbps',
    },
    {
      state: EVoiceConnectionState.DEGRADED,
      tier: EVoiceQualityTier.UNSTABLE,
      suspended: false,
      color: 'var(--tui-status-warning)',
      text: 'Voice quality: degraded. 64 kbps',
    },
    {
      state: EVoiceConnectionState.DEGRADED,
      tier: EVoiceQualityTier.BAD,
      suspended: false,
      color: 'var(--tui-status-negative)',
      text: 'Voice quality: poor. 64 kbps',
    },
    {
      state: EVoiceConnectionState.DEGRADED,
      tier: EVoiceQualityTier.EXCELLENT,
      suspended: false,
      color: 'var(--tui-status-warning)',
      text: 'Voice quality: excellent. 64 kbps',
    },
    {
      state: EVoiceConnectionState.DEGRADED,
      tier: EVoiceQualityTier.GOOD,
      suspended: true,
      color: 'var(--tui-status-warning)',
      text: 'Audio suspended',
    },
    {
      state: EVoiceConnectionState.RECONNECTING,
      tier: EVoiceQualityTier.EXCELLENT,
      suspended: false,
      color: 'var(--tui-text-tertiary)',
      text: 'Reconnecting',
    },
    {
      state: EVoiceConnectionState.DISCONNECTED,
      tier: EVoiceQualityTier.EXCELLENT,
      suspended: false,
      color: 'var(--tui-status-negative)',
      text: 'Disconnected',
    },
    {
      state: EVoiceConnectionState.DEAD,
      tier: EVoiceQualityTier.EXCELLENT,
      suspended: false,
      color: 'var(--tui-status-negative)',
      text: 'Connection lost',
    },
  ])(
    'colors $state at $tier as $color',
    ({ state, tier, suspended, color, text }) => {
      connectionState.set(state);
      qualityTier.set(tier);
      audioSuspended.set(suspended);

      expect(service.indicatorColor()).toBe(color);
      expect(service.qualityText()).toBe(text);
    },
  );

  it('builds the quality label from the title and updates it with the language', () => {
    qualityBitrateKbps.set(16);
    qualityTier.set(EVoiceQualityTier.BAD);
    expect(service.qualityAriaLabel()).toBe('Voice quality: poor. 16 kbps');

    isDirectCallContext.set(true);
    expect(service.qualityAriaLabel()).toBe(
      'Direct Call. Voice quality: poor. 16 kbps',
    );

    translate.use('ru');
    expect(service.qualityAriaLabel()).toContain('Прямой звонок');
    expect(service.qualityAriaLabel()).toContain('Связь: плохая');
    expect(service.qualityAriaLabel()).toContain('16');
  });

  it.each([
    {
      muted: false,
      mic: 'CALL.MUTE_MICROPHONE',
      speaker: 'CALL.MUTE_SPEAKER',
    },
    {
      muted: true,
      mic: 'CALL.UNMUTE_MICROPHONE',
      speaker: 'CALL.UNMUTE_SPEAKER',
    },
  ])('labels mute buttons when muted is $muted', ({ muted, mic, speaker }) => {
    microphoneMuted.set(muted);
    speakerMuted.set(muted);

    expect(service.micLabelKey()).toBe(mic);
    expect(service.speakerLabelKey()).toBe(speaker);
  });

  it('opens the direct chat or the group room', () => {
    isDirectCallContext.set(true);
    service.openSession();
    expect(router.navigate).not.toHaveBeenCalled();

    callWithUserId.set(42);
    service.openSession();
    expect(router.navigate).toHaveBeenCalledWith(['/direct', 42]);

    isDirectCallContext.set(false);
    const room = { id: 5, name: 'Lobby' } as IRoom;
    roomsDict.set({ 5: room });
    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 5,
    });
    service.openSession();
    expect(roomNavigationService.selectRoom).toHaveBeenCalledWith(room);

    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 8,
    });
    service.openSession();
    expect(roomNavigationService.selectRoom).toHaveBeenCalledTimes(1);
  });

  it('toggles media, opens device settings and leaves the session', () => {
    service.toggleMicrophone();
    service.toggleSpeaker();
    service.stopCamera();
    service.stopScreen();
    service.openDevicesSettings();
    service.leaveSession();

    expect(toggleMicrophoneMuted).toHaveBeenCalledTimes(1);
    expect(toggleSpeakerMuted).toHaveBeenCalledTimes(1);
    expect(voiceSessionService.stopCamera).toHaveBeenCalledTimes(1);
    expect(voiceSessionService.stopScreen).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/settings/devices']);
    expect(voiceLeaveService.leaveFromVoiceUi).toHaveBeenCalledTimes(1);
  });
});
