import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
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
import { EVoiceQualityTier, EVoiceSessionType } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallControlsService } from '../call-controls.service';
import { CallControlsBarComponent } from './call-controls-bar.component';

describe('CallControlsBarComponent', () => {
  let fixture: ComponentFixture<CallControlsBarComponent>;
  let localCamTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let stopCamera: ReturnType<typeof vi.fn>;
  let stopScreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localCamTrack = signal(null);
    localScreenTrack = signal(null);
    stopCamera = vi.fn().mockResolvedValue(undefined);
    stopScreen = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [CallControlsBarComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        {
          provide: VoiceSessionStore,
          useValue: {
            activeSession: signal({
              type: EVoiceSessionType.GROUP_ROOM,
              roomId: 42,
            }),
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            isDirectCallContext: signal(false),
            isConnected: signal(false),
            interlocutor: signal(null),
            callWithUserId: signal(null),
          },
        },
        {
          provide: RoomsStore,
          useValue: {
            roomsDict: signal({ 42: { name: 'General Voice' } }),
          },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false),
            speakerMuted: signal(true),
            toggleMicrophoneMuted: vi.fn(),
            toggleSpeakerMuted: vi.fn(),
          },
        },
        {
          provide: VoiceLeaveService,
          useValue: { leaveFromVoiceUi: vi.fn() },
        },
        {
          provide: PeerVideoService,
          useValue: { localCamTrack, localScreenTrack },
        },
        {
          provide: VoiceSessionService,
          useValue: { stopCamera, stopScreen },
        },
        {
          provide: VoiceQualityService,
          useValue: {
            tier: signal(EVoiceQualityTier.EXCELLENT),
            bitrateKbps: signal(64),
          },
        },
        {
          provide: VoiceConnectionStore,
          useValue: {
            state: signal(null),
            audioSuspended: signal(false),
          },
        },
        {
          provide: RoomNavigationService,
          useValue: { selectRoom: vi.fn() },
        },
      ],
    });

    fixture = TestBed.createComponent(CallControlsBarComponent);
    fixture.detectChanges();
  });

  it('uses the shared labels for the session and the mute buttons', () => {
    const service = fixture.debugElement.injector.get(CallControlsService);
    const element: HTMLElement = fixture.nativeElement;

    expect(
      element
        .querySelector('.call-controls-bar-session')
        ?.getAttribute('aria-label'),
    ).toBe(service.qualityAriaLabel());
    expect(
      element
        .querySelector('[aria-label="CALL.MUTE_MICROPHONE"]')
        ?.getAttribute('aria-label'),
    ).toBe(service.micLabelKey());
    expect(
      element.querySelector('[aria-label="CALL.UNMUTE_SPEAKER"]'),
    ).toBeTruthy();
  });

  it('shows camera and screen controls only while those tracks are on', () => {
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[aria-label="CALL.CAMERA_OFF"]')).toBeNull();
    expect(element.querySelector('[aria-label="CALL.SCREEN_OFF"]')).toBeNull();

    localCamTrack.set({} as MediaStreamTrack);
    localScreenTrack.set({} as MediaStreamTrack);
    fixture.detectChanges();

    element
      .querySelector<HTMLButtonElement>('[aria-label="CALL.CAMERA_OFF"]')
      ?.click();
    element
      .querySelector<HTMLButtonElement>('[aria-label="CALL.SCREEN_OFF"]')
      ?.click();

    expect(stopCamera).toHaveBeenCalled();
    expect(stopScreen).toHaveBeenCalled();
  });
});
