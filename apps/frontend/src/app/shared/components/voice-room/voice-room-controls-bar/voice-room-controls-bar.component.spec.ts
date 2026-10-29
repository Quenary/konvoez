import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { EMPTY, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from '@core/services/audio.service';
import { MicrophoneService } from '@core/services/microphone.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { SettingsStore } from '@core/stores/settings.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { TuiNotificationService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { VoiceRoomControlsBarComponent } from './voice-room-controls-bar.component';

describe('VoiceRoomControlsBarComponent', () => {
  let localCamTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let produceCamera: ReturnType<typeof vi.fn>;
  let stopCamera: ReturnType<typeof vi.fn>;
  let produceScreen: ReturnType<typeof vi.fn>;
  let stopScreen: ReturnType<typeof vi.fn>;
  let setStreamHeight: ReturnType<typeof vi.fn>;
  let setStreamFps: ReturnType<typeof vi.fn>;
  let setScreenHeight: ReturnType<typeof vi.fn>;
  let setScreenFps: ReturnType<typeof vi.fn>;
  let setStreamLayers: ReturnType<typeof vi.fn>;
  let setStreamBitrateKbps: ReturnType<typeof vi.fn>;
  let setScreenLayers: ReturnType<typeof vi.fn>;
  let setScreenBitrateKbps: ReturnType<typeof vi.fn>;
  let setScreenContentMode: ReturnType<typeof vi.fn>;
  let openDialog: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.fn>;
  let toggleMicrophoneMuted: ReturnType<typeof vi.fn>;
  let toggleSpeakerMuted: ReturnType<typeof vi.fn>;
  let microphoneMuted: ReturnType<typeof signal<boolean>>;
  let speakerMuted: ReturnType<typeof signal<boolean>>;
  let canProduce: ReturnType<typeof signal<boolean>>;
  let captureLoading: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    localCamTrack = signal<MediaStreamTrack | null>(null);
    localScreenTrack = signal<MediaStreamTrack | null>(null);
    produceCamera = vi.fn().mockResolvedValue(undefined);
    stopCamera = vi.fn().mockResolvedValue(undefined);
    produceScreen = vi.fn().mockResolvedValue(undefined);
    stopScreen = vi.fn().mockResolvedValue(undefined);
    setStreamHeight = vi.fn();
    setStreamFps = vi.fn();
    setScreenHeight = vi.fn();
    setScreenFps = vi.fn();
    setStreamLayers = vi.fn();
    setStreamBitrateKbps = vi.fn();
    setScreenLayers = vi.fn();
    setScreenBitrateKbps = vi.fn();
    setScreenContentMode = vi.fn();
    openDialog = vi.fn(() => of(null));
    notify = vi.fn(() => of(null));
    toggleMicrophoneMuted = vi.fn();
    toggleSpeakerMuted = vi.fn();
    microphoneMuted = signal(false);
    speakerMuted = signal(false);
    canProduce = signal(true);
    captureLoading = signal(false);

    TestBed.configureTestingModule({
      imports: [VoiceRoomControlsBarComponent],
      providers: [
        provideTranslateService(),
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
          provide: SettingsStore,
          useValue: {
            streamHeight: signal(720).asReadonly(),
            streamFps: signal(30).asReadonly(),
            streamLayers: signal(2).asReadonly(),
            streamBitrateKbps: signal<number | null>(2500).asReadonly(),
            screenHeight: signal(1080).asReadonly(),
            screenFps: signal(30).asReadonly(),
            screenLayers: signal(2).asReadonly(),
            screenBitrateKbps: signal<number | null>(null).asReadonly(),
            screenContentMode: signal<'detail' | 'motion'>(
              'detail',
            ).asReadonly(),
            streamMaxBitrateKbps: signal(10000).asReadonly(),
            setStreamHeight,
            setStreamFps,
            setStreamLayers,
            setStreamBitrateKbps,
            setScreenHeight,
            setScreenFps,
            setScreenLayers,
            setScreenBitrateKbps,
            setScreenContentMode,
          },
        },
        {
          provide: AudioService,
          useValue: {
            playMuteAudio: vi.fn(),
            playUnmuteAudio: vi.fn(),
            playDeafenAudio: vi.fn(),
            playUndeafenAudio: vi.fn(),
          },
        },
        {
          provide: MicrophoneService,
          useValue: {
            captureLoading: captureLoading.asReadonly(),
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: localCamTrack.asReadonly(),
            localScreenTrack: localScreenTrack.asReadonly(),
          },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            produceCamera,
            stopCamera,
            produceScreen,
            stopScreen,
            canProduce: canProduce.asReadonly(),
          },
        },
        {
          provide: TuiResponsiveDialogService,
          useValue: { open: openDialog },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: notify },
        },
      ],
    });
    TestBed.inject(TranslateService).instant = ((key: string) =>
      key) as TranslateService['instant'];
  });

  const create = () => {
    const fixture = TestBed.createComponent(VoiceRoomControlsBarComponent);
    fixture.detectChanges();
    return fixture;
  };

  const button = (fixture: ReturnType<typeof create>, index: number) =>
    fixture.nativeElement.querySelectorAll('button')[
      index
    ] as HTMLButtonElement;

  it('stops the camera without opening the start dialog', async () => {
    localCamTrack.set({} as MediaStreamTrack);
    const fixture = create();

    button(fixture, 2).click();
    await fixture.whenStable();

    expect(stopCamera).toHaveBeenCalledTimes(1);
    expect(openDialog).not.toHaveBeenCalled();
    expect(produceCamera).not.toHaveBeenCalled();
  });

  it('starts the camera through the shared dialog', async () => {
    openDialog.mockReturnValue(
      of({ height: 480, fps: 15, layers: 2, bitrateKbps: 1500 }),
    );
    const fixture = create();

    button(fixture, 2).click();
    await fixture.whenStable();

    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(openDialog.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'cam',
          height: 720,
          fps: 30,
          layers: 2,
          bitrateKbps: 2500,
          maxBitrateKbps: 10000,
        }),
      }),
    );
    expect(setStreamHeight).toHaveBeenCalledWith(480);
    expect(setStreamFps).toHaveBeenCalledWith(15);
    expect(setStreamLayers).toHaveBeenCalledWith(2);
    expect(setStreamBitrateKbps).toHaveBeenCalledWith(1500);
    expect(produceCamera).toHaveBeenCalledTimes(1);
    expect(produceScreen).not.toHaveBeenCalled();
  });

  it('saves screen layers, bitrate and content mode from the dialog', async () => {
    openDialog.mockReturnValue(
      of({
        height: 1080,
        fps: 60,
        layers: 3,
        bitrateKbps: 8000,
        contentMode: 'motion',
      }),
    );
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn() },
    });
    const fixture = create();

    await fixture.componentInstance['toggleStream']('screen');

    expect(setScreenHeight).toHaveBeenCalledWith(1080);
    expect(setScreenFps).toHaveBeenCalledWith(60);
    expect(setScreenLayers).toHaveBeenCalledWith(3);
    expect(setScreenBitrateKbps).toHaveBeenCalledWith(8000);
    expect(setScreenContentMode).toHaveBeenCalledWith('motion');
    expect(produceScreen).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('notifies when starting the camera fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* noop */
    });
    openDialog.mockReturnValue(of({ height: 720, fps: 30 }));
    produceCamera.mockRejectedValue(new Error('no camera'));
    const fixture = create();

    button(fixture, 2).click();
    await fixture.whenStable();

    expect(notify).toHaveBeenCalledWith(
      'CALL.CAMERA_FAILED',
      expect.objectContaining({ appearance: 'negative' }),
    );
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('treats a dismissed start dialog as a no-op', async () => {
    openDialog.mockReturnValue(EMPTY);
    const fixture = create();

    await expect(
      fixture.componentInstance['toggleStream']('cam'),
    ).resolves.toBeUndefined();

    expect(produceCamera).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('disables camera controls until the session can produce', () => {
    canProduce.set(false);
    const fixture = create();
    const camButton = button(fixture, 2);
    expect(camButton.disabled).toBe(true);
  });

  it('toggles the microphone', () => {
    const fixture = create();
    button(fixture, 0).click();
    expect(toggleMicrophoneMuted).toHaveBeenCalledTimes(1);
  });

  it('toggles the speaker', () => {
    const fixture = create();
    button(fixture, 1).click();
    expect(toggleSpeakerMuted).toHaveBeenCalledTimes(1);
  });

  it('precomputes micHintKey for loading, muted and unmuted states', () => {
    microphoneMuted.set(false);
    captureLoading.set(false);
    const fixture = create();
    const cmp = fixture.componentInstance;
    expect(cmp['micHintKey']()).toBe('CALL.MUTE_MICROPHONE');

    microphoneMuted.set(true);
    expect(cmp['micHintKey']()).toBe('CALL.UNMUTE_MICROPHONE');

    captureLoading.set(true);
    expect(cmp['micHintKey']()).toBe('CALL.MICROPHONE_LOADING');
  });

  it('precomputes speakerHintKey for muted and unmuted states', () => {
    speakerMuted.set(false);
    const fixture = create();
    const cmp = fixture.componentInstance;
    expect(cmp['speakerHintKey']()).toBe('CALL.MUTE_SPEAKER');

    speakerMuted.set(true);
    expect(cmp['speakerHintKey']()).toBe('CALL.UNMUTE_SPEAKER');
  });

  it('precomputes cameraHintKey and cameraDisabled for all three states', () => {
    canProduce.set(true);
    localCamTrack.set(null);
    const fixture = create();
    const cmp = fixture.componentInstance;

    expect(cmp['cameraHintKey']()).toBe('CALL.CAMERA_ON');
    expect(cmp['cameraDisabled']()).toBe(false);

    localCamTrack.set({} as MediaStreamTrack);
    expect(cmp['cameraHintKey']()).toBe('CALL.CAMERA_OFF');
    expect(cmp['cameraDisabled']()).toBe(false);

    localCamTrack.set(null);
    canProduce.set(false);
    expect(cmp['cameraHintKey']()).toBe('CALL.WAITING_FOR_CONNECTION');
    expect(cmp['cameraDisabled']()).toBe(true);
  });

  it('precomputes screenHintKey and screenDisabled for all three states', () => {
    canProduce.set(true);
    localScreenTrack.set(null);
    const fixture = create();
    const cmp = fixture.componentInstance;

    expect(cmp['screenHintKey']()).toBe('CALL.SCREEN_ON');
    expect(cmp['screenDisabled']()).toBe(false);

    localScreenTrack.set({} as MediaStreamTrack);
    expect(cmp['screenHintKey']()).toBe('CALL.SCREEN_OFF');
    expect(cmp['screenDisabled']()).toBe(false);

    localScreenTrack.set(null);
    canProduce.set(false);
    expect(cmp['screenHintKey']()).toBe('CALL.WAITING_FOR_CONNECTION');
    expect(cmp['screenDisabled']()).toBe(true);
  });
});
