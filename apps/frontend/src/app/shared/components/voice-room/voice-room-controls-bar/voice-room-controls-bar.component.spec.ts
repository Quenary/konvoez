import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { EMPTY, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from '@core/services/audio.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { SettingsStore } from '@features/settings/settings.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
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
  let openDialog: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.fn>;
  let setMicrophoneMuted: ReturnType<typeof vi.fn>;

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
    openDialog = vi.fn(() => of(null));
    notify = vi.fn(() => of(null));
    setMicrophoneMuted = vi.fn();

    TestBed.configureTestingModule({
      imports: [VoiceRoomControlsBarComponent],
      providers: [
        provideTranslateService(),
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false).asReadonly(),
            speakerMuted: signal(false).asReadonly(),
            setMicrophoneMuted,
            setSpeakerMuted: vi.fn(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            streamHeight: signal(720).asReadonly(),
            streamFps: signal(30).asReadonly(),
            screenHeight: signal(1080).asReadonly(),
            screenFps: signal(30).asReadonly(),
            setStreamHeight,
            setStreamFps,
            setScreenHeight,
            setScreenFps,
          },
        },
        {
          provide: AudioService,
          useValue: { playMuteAudio: vi.fn() },
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
          },
        },
        {
          provide: TuiDialogService,
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
    openDialog.mockReturnValue(of({ height: 480, fps: 15 }));
    const fixture = create();

    button(fixture, 2).click();
    await fixture.whenStable();

    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(setStreamHeight).toHaveBeenCalledWith(480);
    expect(setStreamFps).toHaveBeenCalledWith(15);
    expect(produceCamera).toHaveBeenCalledTimes(1);
    expect(produceScreen).not.toHaveBeenCalled();
  });

  it('notifies when starting the camera fails', async () => {
    openDialog.mockReturnValue(of({ height: 720, fps: 30 }));
    produceCamera.mockRejectedValue(new Error('no camera'));
    const fixture = create();

    button(fixture, 2).click();
    await fixture.whenStable();

    expect(notify).toHaveBeenCalledWith(
      'no camera',
      expect.objectContaining({ appearance: 'negative' }),
    );
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

  it('toggles the microphone', () => {
    const fixture = create();
    button(fixture, 0).click();
    expect(setMicrophoneMuted).toHaveBeenCalledWith(true);
  });
});
