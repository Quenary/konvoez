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
import { EVoiceSessionType, IRoom, TVoiceSessionTarget } from '@konvoez/shared';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  let isCallActive: ReturnType<typeof signal<boolean>>;
  let callWithUserId: ReturnType<typeof signal<number | null>>;

  let localCamTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
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
    isCallActive = signal(false);
    callWithUserId = signal(null);

    localCamTrack = signal(null);
    localScreenTrack = signal(null);

    TestBed.configureTestingModule({
      imports: [VoiceRoomPanelComponent],
      providers: [
        provideTranslateService(),
        { provide: Router, useValue: router },
        { provide: RoomNavigationService, useValue: roomNavigationService },
        { provide: VoiceLeaveService, useValue: voiceLeaveService },
        { provide: VoiceSessionService, useValue: voiceSessionService },
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
            isCallActive: isCallActive.asReadonly(),
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
        SOUND: 'Sound',
        CAMERA_OFF: 'Stop camera',
        SCREEN_OFF: 'Stop screen',
      },
    });
    translate.setTranslation('ru', {
      CALL: {
        DIRECT_CALL: 'Прямой звонок',
        HANGUP: 'Положить трубку',
        MUTE_MICROPHONE: 'Выключить микрофон',
        UNMUTE_MICROPHONE: 'Включить микрофон',
        SOUND: 'Звук',
        CAMERA_OFF: 'Выключить камеру',
        SCREEN_OFF: 'Остановить демонстрацию',
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
    isCallActive.set(true);
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

  it('evaluates isSessionActive when activeSession exists or direct call is active', () => {
    const { instance } = createComponent();
    expect(instance['isSessionActive']()).toBe(false);

    activeSession.set({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    expect(instance['isSessionActive']()).toBe(true);

    activeSession.set(null);
    isCallActive.set(true);
    expect(instance['isSessionActive']()).toBe(true);
  });

  it('precomputes micHintKey based on microphoneMuted state', () => {
    const { instance } = createComponent();
    expect(instance['micHintKey']()).toBe('CALL.MUTE_MICROPHONE');

    microphoneMuted.set(true);
    expect(instance['micHintKey']()).toBe('CALL.UNMUTE_MICROPHONE');
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

  it('renders camera and screen stop buttons only when tracks exist', () => {
    const { fixture } = createComponent();
    expect(
      fixture.nativeElement.querySelectorAll('button[iconStart="@tui.video"]')
        .length,
    ).toBe(0);
    expect(
      fixture.nativeElement.querySelectorAll(
        'button[iconStart="@tui.screen-share-off"]',
      ).length,
    ).toBe(0);

    localCamTrack.set({} as MediaStreamTrack);
    localScreenTrack.set({} as MediaStreamTrack);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('button[iconStart="@tui.video"]')
        .length,
    ).toBe(1);
    expect(
      fixture.nativeElement.querySelectorAll(
        'button[iconStart="@tui.screen-share-off"]',
      ).length,
    ).toBe(1);
  });
});
