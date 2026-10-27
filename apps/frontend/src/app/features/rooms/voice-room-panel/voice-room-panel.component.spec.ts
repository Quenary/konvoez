import { ComponentRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import {
  EVoiceConnectionState,
  EVoiceQualityTier,
  EVoiceSessionType,
  IRoom,
  TVoiceSessionTarget,
} from '@konvoez/shared';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceQualityService } from '@core/services/voice-quality.service';
import { RoomNavigationService } from '../room-navigation.service';
import { VoiceRoomPanelComponent } from './voice-room-panel.component';
describe('VoiceRoomPanelComponent', () => {
  let router: { navigate: ReturnType<typeof vi.fn> };
  let roomNavigationService: { selectRoom: ReturnType<typeof vi.fn> };
  let voiceLeaveService: { leaveActiveVoice: ReturnType<typeof vi.fn> };
  let voiceSessionService: {
    stopCamera: ReturnType<typeof vi.fn>;
    stopScreen: ReturnType<typeof vi.fn>;
  };

  let roomsDict: ReturnType<typeof signal<Record<number, IRoom>>>;
  let activeSession: ReturnType<typeof signal<TVoiceSessionTarget | null>>;
  let microphoneMuted: ReturnType<typeof signal<boolean>>;
  let speakerMuted: ReturnType<typeof signal<boolean>>;
  let toggleMicrophoneMuted: ReturnType<typeof vi.fn>;
  let toggleSpeakerMuted: ReturnType<typeof vi.fn>;

  let isDirectCallContext: ReturnType<typeof signal<boolean>>;
  let isConnected: ReturnType<typeof signal<boolean>>;
  let callWithUserId: ReturnType<typeof signal<number | null>>;

  let localCamTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let qualityTier: ReturnType<typeof signal<EVoiceQualityTier>>;
  let qualityBitrateKbps: ReturnType<typeof signal<number>>;
  let connectionState: ReturnType<typeof signal<EVoiceConnectionState | null>>;
  let audioSuspended: ReturnType<typeof signal<boolean>>;
  let translate: TranslateService;

  beforeEach(() => {
    router = { navigate: vi.fn().mockResolvedValue(true) };
    roomNavigationService = { selectRoom: vi.fn() };
    voiceLeaveService = {
      leaveActiveVoice: vi.fn().mockResolvedValue(undefined),
    };
    voiceSessionService = {
      stopCamera: vi.fn().mockResolvedValue(undefined),
      stopScreen: vi.fn().mockResolvedValue(undefined),
    };

    roomsDict = signal({});
    activeSession = signal(null);
    microphoneMuted = signal(false);
    speakerMuted = signal(false);
    toggleMicrophoneMuted = vi.fn();
    toggleSpeakerMuted = vi.fn();

    isDirectCallContext = signal(false);
    isConnected = signal(false);
    callWithUserId = signal(null);

    localCamTrack = signal(null);
    localScreenTrack = signal(null);
    qualityTier = signal(EVoiceQualityTier.EXCELLENT);
    qualityBitrateKbps = signal(64);
    connectionState = signal<EVoiceConnectionState | null>(null);
    audioSuspended = signal(false);

    TestBed.configureTestingModule({
      imports: [VoiceRoomPanelComponent],
      providers: [
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
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: localCamTrack.asReadonly(),
            localScreenTrack: localScreenTrack.asReadonly(),
          },
        },
      ],
    });

    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      CALL: {
        DIRECT_CALL: 'Direct Call',
        HANGUP: 'Hang up',
        MUTE_MICROPHONE: 'Mute',
        UNMUTE_MICROPHONE: 'Unmute',
        MUTE_SPEAKER: 'Turn off sound',
        UNMUTE_SPEAKER: 'Turn on sound',
        CAMERA_OFF: 'Stop camera',
        SCREEN_OFF: 'Stop screen',
        OPEN_DEVICES_SETTINGS: 'Open device settings',
        QUALITY: {
          LEVEL_0: 'Voice quality: excellent. {{kbps}} kbps',
          LEVEL_1: 'Voice quality: good. {{kbps}} kbps',
          LEVEL_2: 'Voice quality: degraded. {{kbps}} kbps',
          LEVEL_3: 'Voice quality: poor. {{kbps}} kbps',
        },
      },
      SETTINGS: {
        ADMIN: {
          VOICE_MAX_BITRATE: 'Voice bitrate (kbps)',
        },
      },
    });
    translate.setTranslation('ru', {
      CALL: {
        DIRECT_CALL: 'Прямой звонок',
        HANGUP: 'Положить трубку',
        MUTE_MICROPHONE: 'Выключить микрофон',
        UNMUTE_MICROPHONE: 'Включить микрофон',
        MUTE_SPEAKER: 'Выключить звук',
        UNMUTE_SPEAKER: 'Включить звук',
        CAMERA_OFF: 'Выключить камеру',
        SCREEN_OFF: 'Остановить демонстрацию',
        OPEN_DEVICES_SETTINGS: 'Открыть настройки устройств',
        QUALITY: {
          LEVEL_0: 'Связь: отличная. Битрейт голоса: {{kbps}} кбит/с',
          LEVEL_1: 'Связь: хорошая. Битрейт голоса: {{kbps}} кбит/с',
          LEVEL_2: 'Связь: нестабильная. Битрейт голоса: {{kbps}} кбит/с',
          LEVEL_3: 'Связь: плохая. Битрейт голоса: {{kbps}} кбит/с',
        },
      },
      SETTINGS: {
        ADMIN: {
          VOICE_MAX_BITRATE: 'Битрейт голоса (кбит/с)',
        },
      },
    });
    translate.use('en');
  });

  const createComponent = (collapsed = false) => {
    const fixture = TestBed.createComponent(VoiceRoomPanelComponent);
    const componentRef: ComponentRef<VoiceRoomPanelComponent> =
      fixture.componentRef;
    componentRef.setInput('collapsed', collapsed);
    fixture.detectChanges();
    return { fixture, instance: fixture.componentInstance };
  };

  it('computes sessionTitle as translation key for direct call and updates with language changes', () => {
    isDirectCallContext.set(true);
    isConnected.set(true);
    const { fixture, instance } = createComponent();

    expect(instance['sessionTitle']()).toBe('CALL.DIRECT_CALL');

    translate.use('ru');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button?.textContent?.trim()).toBe('Прямой звонок');

    translate.use('en');
    fixture.detectChanges();
    expect(button?.textContent?.trim()).toBe('Direct Call');
  });

  it('computes sessionTitle as room name for group room session', () => {
    roomsDict.set({
      10: { id: 10, name: 'General Voice' } as IRoom,
    });
    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 10,
    });

    const { fixture, instance } = createComponent();

    expect(instance['sessionTitle']()).toBe('General Voice');
    const button = fixture.nativeElement.querySelector('button');
    expect(button?.textContent?.trim()).toBe('General Voice');
  });

  it('computes sessionTitle as empty string when no session and not direct call', () => {
    const { instance } = createComponent();
    expect(instance['sessionTitle']()).toBe('');
  });

  it('evaluates isSessionActive when activeSession exists or direct call is connected', () => {
    const { instance } = createComponent();
    expect(instance['isSessionActive']()).toBe(false);

    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    expect(instance['isSessionActive']()).toBe(true);

    activeSession.set(null);
    isConnected.set(true);
    expect(instance['isSessionActive']()).toBe(true);
  });

  it('precomputes micHintKey based on microphoneMuted state', () => {
    const { instance } = createComponent();
    expect(instance['micHintKey']()).toBe('CALL.MUTE_MICROPHONE');

    microphoneMuted.set(true);
    expect(instance['micHintKey']()).toBe('CALL.UNMUTE_MICROPHONE');
  });

  it('precomputes speakerHintKey based on speakerMuted state', () => {
    const { instance } = createComponent();
    expect(instance['speakerHintKey']()).toBe('CALL.MUTE_SPEAKER');

    speakerMuted.set(true);
    expect(instance['speakerHintKey']()).toBe('CALL.UNMUTE_SPEAKER');
  });

  it('navigates to direct chat on clickSession when in direct call', () => {
    isDirectCallContext.set(true);
    callWithUserId.set(42);
    const { instance } = createComponent();

    instance['clickSession']();
    expect(router.navigate).toHaveBeenCalledWith(['/direct', 42]);
  });

  it('selects room on clickSession when in group room', () => {
    const testRoom = { id: 5, name: 'Lobby' } as IRoom;
    roomsDict.set({ 5: testRoom });
    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 5,
    });
    const { instance } = createComponent();

    instance['clickSession']();
    expect(roomNavigationService.selectRoom).toHaveBeenCalledWith(testRoom);
  });

  it('calls leaveSession, toggleMicrophoneMuted, toggleSpeakerMuted, stopCamera, stopScreen', () => {
    const { instance } = createComponent();

    instance['leaveSession']();
    expect(voiceLeaveService.leaveActiveVoice).toHaveBeenCalledTimes(1);

    instance['toggleMicrophoneMuted']();
    expect(toggleMicrophoneMuted).toHaveBeenCalledTimes(1);

    instance['toggleSpeakerMuted']();
    expect(toggleSpeakerMuted).toHaveBeenCalledTimes(1);

    instance['stopCamera']();
    expect(voiceSessionService.stopCamera).toHaveBeenCalledTimes(1);

    instance['stopScreen']();
    expect(voiceSessionService.stopScreen).toHaveBeenCalledTimes(1);
  });

  it('navigates to device settings on openDevicesSettings', () => {
    const { instance } = createComponent();

    instance['openDevicesSettings']();
    expect(router.navigate).toHaveBeenCalledWith(['/settings/devices']);
  });

  it('renders camera and screen stop buttons only when tracks exist', () => {
    const { fixture } = createComponent();
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(3);

    localCamTrack.set({} as MediaStreamTrack);
    localScreenTrack.set({} as MediaStreamTrack);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(5);
  });

  it('computes qualityColor token for each tier', () => {
    const { instance } = createComponent();

    qualityTier.set(EVoiceQualityTier.EXCELLENT);
    expect(instance['qualityColor']()).toBe('var(--tui-status-positive)');

    qualityTier.set(EVoiceQualityTier.GOOD);
    expect(instance['qualityColor']()).toBe('var(--tui-status-info)');

    qualityTier.set(EVoiceQualityTier.UNSTABLE);
    expect(instance['qualityColor']()).toBe('var(--tui-status-warning)');

    qualityTier.set(EVoiceQualityTier.BAD);
    expect(instance['qualityColor']()).toBe('var(--tui-status-negative)');
  });

  it('computes qualityHintKey and qualityAriaLabel and updates on language change', () => {
    const { instance } = createComponent();

    qualityTier.set(EVoiceQualityTier.EXCELLENT);
    qualityBitrateKbps.set(64);
    expect(instance['qualityHintKey']()).toBe('CALL.QUALITY.LEVEL_0');
    expect(instance['qualityAriaLabel']()).toContain(
      'Voice quality: excellent',
    );
    expect(instance['qualityAriaLabel']()).toContain('64 kbps');

    qualityTier.set(EVoiceQualityTier.BAD);
    qualityBitrateKbps.set(16);
    expect(instance['qualityHintKey']()).toBe('CALL.QUALITY.LEVEL_3');
    expect(instance['qualityAriaLabel']()).toContain('Voice quality: poor');
    expect(instance['qualityAriaLabel']()).toContain('16 kbps');

    isDirectCallContext.set(true);
    isConnected.set(true);
    expect(instance['qualityAriaLabel']()).toContain('Direct Call');
    expect(instance['qualityAriaLabel']()).toContain('Voice quality: poor');

    translate.use('ru');
    expect(instance['qualityAriaLabel']()).toContain('Прямой звонок');
    expect(instance['qualityAriaLabel']()).toContain('Связь: плохая');
  });

  it('binds quality color and neutral appearance on session button', () => {
    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    qualityTier.set(EVoiceQualityTier.EXCELLENT);
    const { fixture } = createComponent();
    const sessionButton = fixture.nativeElement.querySelector(
      'button.panel-button-spaced',
    ) as HTMLElement;

    expect(sessionButton).toBeTruthy();
    expect(sessionButton.getAttribute('appearance')).toBe('neutral');
    const icon = sessionButton.querySelector('tui-icon') as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.style.color).toBe('var(--tui-status-positive)');
  });

  it('computes indicatorColor and connectionHintKey across connection states', () => {
    const { instance } = createComponent();

    // CONNECTED delegates to quality
    connectionState.set(EVoiceConnectionState.CONNECTED);
    qualityTier.set(EVoiceQualityTier.EXCELLENT);
    expect(instance['indicatorColor']()).toBe('var(--tui-status-positive)');
    expect(instance['connectionHintKey']()).toBe('CALL.QUALITY.LEVEL_0');

    // DEGRADED with UNSTABLE or BAD keeps quality color
    connectionState.set(EVoiceConnectionState.DEGRADED);
    qualityTier.set(EVoiceQualityTier.UNSTABLE);
    expect(instance['indicatorColor']()).toBe('var(--tui-status-warning)');
    expect(instance['connectionHintKey']()).toBe('CALL.QUALITY.LEVEL_2');

    // DEGRADED with audioSuspended
    audioSuspended.set(true);
    expect(instance['connectionHintKey']()).toBe(
      'CALL.CONNECTION.AUDIO_SUSPENDED',
    );

    // RECONNECTING -> grey
    connectionState.set(EVoiceConnectionState.RECONNECTING);
    expect(instance['indicatorColor']()).toBe('var(--tui-text-tertiary)');
    expect(instance['connectionHintKey']()).toBe(
      'CALL.CONNECTION.RECONNECTING',
    );

    // DISCONNECTED and DEAD -> red
    connectionState.set(EVoiceConnectionState.DISCONNECTED);
    expect(instance['indicatorColor']()).toBe('var(--tui-status-negative)');
    expect(instance['connectionHintKey']()).toBe(
      'CALL.CONNECTION.DISCONNECTED',
    );

    connectionState.set(EVoiceConnectionState.DEAD);
    expect(instance['indicatorColor']()).toBe('var(--tui-status-negative)');
    expect(instance['connectionHintKey']()).toBe('CALL.CONNECTION.DEAD');
  });
});
