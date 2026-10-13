import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsDevicesComponent } from './settings-devices.component';
import { SettingsStore } from '@core/stores/settings.store';
import { MicTestService } from '@core/services/mic-test.service';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { TuiNotificationService } from '@taiga-ui/core';
import { TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { ENoiseProcessor } from '../../../app.enums';
import { of } from 'rxjs';

describe('SettingsDevicesComponent', () => {
  let component: SettingsDevicesComponent;
  let micTestService: {
    isRunning: ReturnType<typeof signal<boolean>>;
    level: ReturnType<typeof signal<number>>;
    isSinkIdSupported: ReturnType<typeof signal<boolean>>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    restart: ReturnType<typeof vi.fn>;
  };
  let settingsStore: {
    audioInput: ReturnType<typeof signal<MediaDeviceInfo | null>>;
    audioOutput: ReturnType<typeof signal<MediaDeviceInfo | null>>;
    noiseProcessor: ReturnType<typeof signal<ENoiseProcessor>>;
    inputGain: ReturnType<typeof signal<number>>;
    outputVolume: ReturnType<typeof signal<number>>;
    echoCancellation: ReturnType<typeof signal<boolean>>;
    setAudioInput: ReturnType<typeof vi.fn>;
    setAudioOutput: ReturnType<typeof vi.fn>;
    setNoiseProcessor: ReturnType<typeof vi.fn>;
    setInputGain: ReturnType<typeof vi.fn>;
    setOutputVolume: ReturnType<typeof vi.fn>;
    setEchoCancellation: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    micTestService = {
      isRunning: signal(false),
      level: signal(0),
      isSinkIdSupported: signal(true),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
    };
    settingsStore = {
      audioInput: signal(null),
      audioOutput: signal(null),
      noiseProcessor: signal(ENoiseProcessor.DEEPFILTER),
      inputGain: signal(1.2),
      outputVolume: signal(0.9),
      echoCancellation: signal(true),
      setAudioInput: vi.fn(),
      setAudioOutput: vi.fn(),
      setNoiseProcessor: vi.fn(),
      setInputGain: vi.fn(),
      setOutputVolume: vi.fn(),
      setEchoCancellation: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [SettingsDevicesComponent],
      providers: [
        { provide: SettingsStore, useValue: settingsStore },
        { provide: MicTestService, useValue: micTestService },
        {
          provide: MediaDevicesService,
          useValue: {
            getUserMedia: vi.fn().mockResolvedValue({
              getAudioTracks: () => [],
              getTracks: () => [],
            }),
            enumerateDevices: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue(of(null)) },
        },
        {
          provide: TranslateService,
          useValue: {
            instant: (key: string) => key,
            get: (key: string) => of(key),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(SettingsDevicesComponent);
    component = fixture.componentInstance;
  });

  it('creates the component and exposes computed percentages', () => {
    expect(component).toBeTruthy();
    expect(component['inputGainPercent']()).toBe(120);
    expect(component['outputVolumePercent']()).toBe(90);
  });

  it('toggles mic test start and stop', async () => {
    await component['toggleMicTest']();
    expect(micTestService.start).toHaveBeenCalled();

    micTestService.isRunning.set(true);
    await component['toggleMicTest']();
    expect(micTestService.stop).toHaveBeenCalled();
  });

  it('delegates noise processor change to store', () => {
    component['onSelectNoiseProcessor'](ENoiseProcessor.RNNOISE);
    expect(settingsStore.setNoiseProcessor).toHaveBeenCalledWith(
      ENoiseProcessor.RNNOISE,
    );
  });

  it('delegates gain, volume and echo cancellation changes to store', () => {
    component['onInputGainChange'](150);
    expect(settingsStore.setInputGain).toHaveBeenCalledWith(1.5);

    component['onOutputVolumeChange'](80);
    expect(settingsStore.setOutputVolume).toHaveBeenCalledWith(0.8);

    component['onEchoCancellationChange'](false);
    expect(settingsStore.setEchoCancellation).toHaveBeenCalledWith(false);
  });
});
