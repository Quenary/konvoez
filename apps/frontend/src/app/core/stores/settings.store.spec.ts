import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { SettingsApiService } from '@core/api/settings-api.service';
import { SettingsStore } from './settings.store';
import {
  AUDIO_DEVICE_HANDLER,
  IAudioDeviceHandler,
} from '@core/tokens/audio-device-handler.token';
import { MicrophoneService } from '@core/services/microphone.service';
import { SpeakerService } from '@core/services/speaker.service';
import { authReducer } from '@core/auth/auth.reducer';
import { AuthActions } from '@core/auth/auth.actions';
import {
  attachmentsDefaultMaxFileSize,
  attachmentsDefaultMaxFilesPerMessage,
  ESettingKey,
  TSetting,
} from '@konvoez/shared';
import { ENoiseProcessor, EStorageKey } from '../../app.enums';
import {
  DEFAULT_ECHO_CANCELLATION,
  DEFAULT_INPUT_GAIN,
  DEFAULT_NOISE_PROCESSOR,
  DEFAULT_OUTPUT_VOLUME,
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  LOCAL_SETTINGS_VERSION,
} from '@shared/schemas/local-settings.schema';

describe('SettingsStore', () => {
  let store: InstanceType<typeof SettingsStore>;
  let apiService: {
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let audioDeviceHandler: IAudioDeviceHandler;
  let microphone: {
    setGain: ReturnType<typeof vi.fn>;
    setProcessor: ReturnType<typeof vi.fn>;
    setEchoCancellation: ReturnType<typeof vi.fn>;
  };
  let speaker: {
    setMasterVolume: ReturnType<typeof vi.fn>;
  };
  let mockNotifications: { open: ReturnType<typeof vi.fn> };
  let ngrxStore: Store;

  const mockDevice = (overrides: Partial<MediaDeviceInfo>): MediaDeviceInfo =>
    ({
      deviceId: 'id',
      kind: 'audioinput',
      label: 'Device',
      groupId: 'group',
      toJSON() {
        return this;
      },
      ...overrides,
    }) as MediaDeviceInfo;

  const mockSettings: TSetting[] = [
    {
      key: ESettingKey.ICE_SERVERS,
      value: [{ urls: 'stun:stun.l.google.com:19302' }],
      createdAt: new Date(),
      updatedAt: null,
      envLocked: false,
    },
  ];

  const createFreshMocks = () => {
    apiService = {
      list: vi.fn().mockReturnValue(of(mockSettings)),
      update: vi.fn().mockReturnValue(of(mockSettings)),
    };

    audioDeviceHandler = {
      setAudioInput: vi.fn(),
      setAudioOutput: vi.fn(),
    };

    microphone = {
      setGain: vi.fn(),
      setProcessor: vi.fn().mockResolvedValue(undefined),
      setEchoCancellation: vi.fn().mockResolvedValue(undefined),
    };

    speaker = {
      setMasterVolume: vi.fn(),
    };

    mockNotifications = {
      open: vi.fn().mockReturnValue(of(null)),
    };
  };

  const configureTestBed = () => {
    TestBed.resetTestingModule();
    createFreshMocks();
    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: SettingsApiService, useValue: apiService },
        { provide: AUDIO_DEVICE_HANDLER, useValue: audioDeviceHandler },
        { provide: MicrophoneService, useValue: microphone },
        { provide: SpeakerService, useValue: speaker },
        { provide: TuiNotificationService, useValue: mockNotifications },
        SettingsStore,
      ],
    });

    ngrxStore = TestBed.inject(Store);
    store = TestBed.inject(SettingsStore);
  };

  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    configureTestBed();
  });

  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('should initialize with empty settings and need initial setup', () => {
    TestBed.flushEffects();
    expect(store.settings()).toEqual([]);
    expect(store.entities()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.audioInput()).toBeNull();
    expect(store.audioOutput()).toBeNull();
    expect(store.noiseProcessor()).toBe(DEFAULT_NOISE_PROCESSOR);
    expect(store.inputGain()).toBe(DEFAULT_INPUT_GAIN);
    expect(store.outputVolume()).toBe(DEFAULT_OUTPUT_VOLUME);
    expect(store.echoCancellation()).toBe(DEFAULT_ECHO_CANCELLATION);
    expect(store.iceServers()).toEqual([]);
    expect(store.attachmentsEnabled()).toBe(true);
    expect(store.attachmentsMaxFileSize()).toBe(attachmentsDefaultMaxFileSize);
    expect(store.attachmentsMaxFilesPerMessage()).toBe(
      attachmentsDefaultMaxFilesPerMessage,
    );
    expect(store.attachmentsStripImageMetadata()).toBe(false);
    expect(store.needsInitialSetup()).toBe(true);
  });

  it('should hydrate known fields from LOCAL_SETTINGS', () => {
    localStorage.clear();
    const audioInput = {
      deviceId: 'mic-1',
      kind: 'audioinput',
      label: 'Mic',
      groupId: 'g1',
    };
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ version: LOCAL_SETTINGS_VERSION, audioInput }),
    );

    configureTestBed();

    const hydrated = TestBed.inject(SettingsStore);
    expect(hydrated.audioInput()).toEqual(audioInput);
    expect(hydrated.audioOutput()).toBeNull();
    expect(hydrated.needsInitialSetup()).toBe(false);
    expect(audioDeviceHandler.setAudioInput).toHaveBeenCalledWith(audioInput);
  });

  it('should need setup when schema version mismatches', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ version: 0 }),
    );

    configureTestBed();

    expect(TestBed.inject(SettingsStore).needsInitialSetup()).toBe(true);
  });

  it('should not read legacy AUDIO_INPUT / AUDIO_OUTPUT keys', () => {
    localStorage.setItem(
      'konvoez-audio-input',
      JSON.stringify({
        deviceId: 'legacy-mic',
        kind: 'audioinput',
        label: 'Legacy',
        groupId: 'g',
      }),
    );

    configureTestBed();

    const hydrated = TestBed.inject(SettingsStore);
    expect(hydrated.audioInput()).toBeNull();
  });

  it('should update audioInput without stamping schema version', () => {
    const device = mockDevice({
      deviceId: 'mic-1',
      label: 'Microphone 1',
      kind: 'audioinput',
    });

    store.setAudioInput(device);

    expect(store.audioInput()).toEqual(device);
    expect(audioDeviceHandler.setAudioInput).toHaveBeenCalledWith(device);
    expect(
      JSON.parse(localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}'),
    ).toEqual({
      audioInput: {
        deviceId: 'mic-1',
        kind: 'audioinput',
        label: 'Microphone 1',
        groupId: 'group',
      },
      streamHeight: DEFAULT_STREAM_HEIGHT,
      streamFps: DEFAULT_STREAM_FPS,
      screenHeight: DEFAULT_STREAM_HEIGHT,
      screenFps: DEFAULT_STREAM_FPS,
      screenPreviewAutoPauseWhenHidden: true,
      noiseProcessor: DEFAULT_NOISE_PROCESSOR,
      inputGain: DEFAULT_INPUT_GAIN,
      outputVolume: DEFAULT_OUTPUT_VOLUME,
      echoCancellation: DEFAULT_ECHO_CANCELLATION,
    });
    expect(store.needsInitialSetup()).toBe(true);
  });

  it('should stamp schema version on persistLocalSettings', () => {
    store.persistLocalSettings();

    expect(store.needsInitialSetup()).toBe(false);
    expect(
      JSON.parse(localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}'),
    ).toEqual({
      version: LOCAL_SETTINGS_VERSION,
      streamHeight: DEFAULT_STREAM_HEIGHT,
      streamFps: DEFAULT_STREAM_FPS,
      screenHeight: DEFAULT_STREAM_HEIGHT,
      screenFps: DEFAULT_STREAM_FPS,
      screenPreviewAutoPauseWhenHidden: true,
      noiseProcessor: DEFAULT_NOISE_PROCESSOR,
      inputGain: DEFAULT_INPUT_GAIN,
      outputVolume: DEFAULT_OUTPUT_VOLUME,
      echoCancellation: DEFAULT_ECHO_CANCELLATION,
    });
  });

  it('should keep version when updating devices after setup', () => {
    store.persistLocalSettings();
    const device = mockDevice({
      deviceId: 'mic-1',
      kind: 'audioinput',
      label: 'Mic',
    });

    store.setAudioInput(device);

    expect(
      JSON.parse(localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}'),
    ).toEqual({
      version: LOCAL_SETTINGS_VERSION,
      audioInput: {
        deviceId: 'mic-1',
        kind: 'audioinput',
        label: 'Mic',
        groupId: 'group',
      },
      streamHeight: DEFAULT_STREAM_HEIGHT,
      streamFps: DEFAULT_STREAM_FPS,
      screenHeight: DEFAULT_STREAM_HEIGHT,
      screenFps: DEFAULT_STREAM_FPS,
      screenPreviewAutoPauseWhenHidden: true,
      noiseProcessor: DEFAULT_NOISE_PROCESSOR,
      inputGain: DEFAULT_INPUT_GAIN,
      outputVolume: DEFAULT_OUTPUT_VOLUME,
      echoCancellation: DEFAULT_ECHO_CANCELLATION,
    });
    expect(store.needsInitialSetup()).toBe(false);
  });

  it('should update audioOutput, save LOCAL_SETTINGS and call audioDeviceHandler', () => {
    const device = mockDevice({
      deviceId: 'speaker-1',
      label: 'Speaker 1',
      kind: 'audiooutput',
    });

    store.setAudioOutput(device);

    expect(store.audioOutput()).toEqual(device);
    expect(audioDeviceHandler.setAudioOutput).toHaveBeenCalledWith(device);
    expect(
      JSON.parse(localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}'),
    ).toEqual({
      audioOutput: {
        deviceId: 'speaker-1',
        kind: 'audiooutput',
        label: 'Speaker 1',
        groupId: 'group',
      },
      streamHeight: DEFAULT_STREAM_HEIGHT,
      streamFps: DEFAULT_STREAM_FPS,
      screenHeight: DEFAULT_STREAM_HEIGHT,
      screenFps: DEFAULT_STREAM_FPS,
      screenPreviewAutoPauseWhenHidden: true,
      noiseProcessor: DEFAULT_NOISE_PROCESSOR,
      inputGain: DEFAULT_INPUT_GAIN,
      outputVolume: DEFAULT_OUTPUT_VOLUME,
      echoCancellation: DEFAULT_ECHO_CANCELLATION,
    });
  });

  it('should update and persist audio preferences and call audio services', () => {
    store.setNoiseProcessor(ENoiseProcessor.RNNOISE);
    store.setInputGain(1.5);
    store.setOutputVolume(0.5);
    store.setEchoCancellation(true);

    expect(store.noiseProcessor()).toBe(ENoiseProcessor.RNNOISE);
    expect(store.inputGain()).toBe(1.5);
    expect(store.outputVolume()).toBe(0.5);
    expect(store.echoCancellation()).toBe(true);

    expect(microphone.setProcessor).toHaveBeenCalledWith(
      ENoiseProcessor.RNNOISE,
    );
    expect(microphone.setGain).toHaveBeenCalledWith(1.5);
    expect(microphone.setEchoCancellation).toHaveBeenCalledWith(true);
    expect(speaker.setMasterVolume).toHaveBeenCalledWith(0.5);

    const saved = JSON.parse(
      localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}',
    );
    expect(saved.noiseProcessor).toBe(ENoiseProcessor.RNNOISE);
    expect(saved.inputGain).toBe(1.5);
    expect(saved.outputVolume).toBe(0.5);
    expect(saved.echoCancellation).toBe(true);
  });

  it('should hydrate audio preferences from LOCAL_SETTINGS', () => {
    localStorage.clear();
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        version: LOCAL_SETTINGS_VERSION,
        noiseProcessor: ENoiseProcessor.BROWSER,
        inputGain: 0.8,
        outputVolume: 1.2,
        echoCancellation: true,
      }),
    );

    configureTestBed();

    const hydrated = TestBed.inject(SettingsStore);
    expect(hydrated.noiseProcessor()).toBe(ENoiseProcessor.BROWSER);
    expect(hydrated.inputGain()).toBe(0.8);
    expect(hydrated.outputVolume()).toBe(1.2);
    expect(hydrated.echoCancellation()).toBe(true);
    expect(microphone.setProcessor).toHaveBeenCalledWith(
      ENoiseProcessor.BROWSER,
    );
    expect(microphone.setGain).toHaveBeenCalledWith(0.8);
    expect(microphone.setEchoCancellation).toHaveBeenCalledWith(true);
    expect(speaker.setMasterVolume).toHaveBeenCalledWith(1.2);
  });

  it('defaults to RNNoise on mobile when no preference is saved', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgentData: { mobile: true },
        userAgent: 'Mobile',
        maxTouchPoints: 5,
      },
    });

    configureTestBed();

    const mobileStore = TestBed.inject(SettingsStore);
    expect(mobileStore.noiseProcessor()).toBe(ENoiseProcessor.RNNOISE);
    expect(mobileStore.effectiveNoiseProcessor()).toBe(ENoiseProcessor.RNNOISE);
  });

  it('preserves saved deepfilter preference on mobile', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgentData: { mobile: true },
        userAgent: 'Mobile',
        maxTouchPoints: 5,
      },
    });
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        version: LOCAL_SETTINGS_VERSION,
        noiseProcessor: ENoiseProcessor.DEEPFILTER,
      }),
    );

    configureTestBed();

    const mobileStore = TestBed.inject(SettingsStore);
    expect(mobileStore.noiseProcessor()).toBe(ENoiseProcessor.DEEPFILTER);
  });

  it('keeps state as deepfilter when SIMD is unsupported, but computes effective as RNNoise and persists deepfilter', () => {
    vi.spyOn(WebAssembly, 'validate').mockReturnValue(false);

    configureTestBed();

    const fallbackStore = TestBed.inject(SettingsStore);
    expect(fallbackStore.noiseProcessor()).toBe(ENoiseProcessor.DEEPFILTER);
    expect(fallbackStore.effectiveNoiseProcessor()).toBe(
      ENoiseProcessor.RNNOISE,
    );
    expect(microphone.setProcessor).toHaveBeenCalledWith(
      ENoiseProcessor.RNNOISE,
    );

    fallbackStore.setInputGain(1.2);
    const saved = JSON.parse(
      localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}',
    );
    expect(saved.noiseProcessor).toBe(ENoiseProcessor.DEEPFILTER);
    expect(saved.inputGain).toBe(1.2);
  });

  it('should fetch settings, populate entities and compute iceServers on loadAll', () => {
    store.loadAll();
    TestBed.flushEffects();

    expect(apiService.list).toHaveBeenCalled();
    expect(store.settings()).toEqual(mockSettings);
    expect(store.entities()).toEqual(mockSettings);
    expect(store.entityMap()[ESettingKey.ICE_SERVERS]).toEqual(mockSettings[0]);
    expect(store.loading()).toBe(false);
    expect(store.iceServers()).toEqual(mockSettings[0].value);
  });

  it('should handle error when loadAll fails', () => {
    apiService.list.mockReturnValue(
      throwError(() => new Error('Network error')),
    );

    store.loadAll();
    TestBed.flushEffects();

    expect(store.loading()).toBe(false);
    expect(mockNotifications.open).toHaveBeenCalled();
  });

  it('should automatically request settings when user becomes authorized', () => {
    apiService.list.mockClear();

    ngrxStore.dispatch(
      AuthActions.initEnd({
        user: {
          id: 1,
          username: 'tester',
          email: 'test@example.com',
          fullname: 'Test User',
          isOwner: false,
          roles: [],
          permissions: [],
          avatar: null,
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: null,
        },
      }),
    );

    TestBed.flushEffects();

    expect(apiService.list).toHaveBeenCalled();
    expect(store.settings()).toEqual(mockSettings);
  });

  it('should call update and patch store entities on updateSettings', () => {
    const updatedSettings: TSetting[] = [
      {
        key: ESettingKey.INVITE_ONLY_SIGN_UP,
        value: false,
        createdAt: new Date(),
        updatedAt: null,
        envLocked: false,
      },
    ];
    apiService.update.mockReturnValue(of(updatedSettings));

    store.updateSettings([
      { key: ESettingKey.INVITE_ONLY_SIGN_UP, value: false },
    ]);
    TestBed.flushEffects();

    expect(apiService.update).toHaveBeenCalledWith([
      { key: ESettingKey.INVITE_ONLY_SIGN_UP, value: false },
    ]);
    expect(store.entityMap()[ESettingKey.INVITE_ONLY_SIGN_UP]).toEqual(
      updatedSettings[0],
    );
    expect(mockNotifications.open).toHaveBeenCalled();
  });

  it('computes voiceMaxBitrateKbps with fallback to default and reflects loaded settings', () => {
    configureTestBed();
    expect(store.voiceMaxBitrateKbps()).toBe(64);

    const setting: TSetting = {
      key: ESettingKey.VOICE_MAX_BITRATE_KBPS,
      value: 128,
      createdAt: new Date(),
      updatedAt: null,
      envLocked: true,
    };
    apiService.list.mockReturnValue(of([setting]));

    store.loadAll();
    TestBed.flushEffects();

    expect(store.voiceMaxBitrateKbps()).toBe(128);
  });
});
