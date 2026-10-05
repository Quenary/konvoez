import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { SettingsApiService } from './settings-api.service';
import { SettingsStore } from './settings.store';
import {
  AUDIO_DEVICE_HANDLER,
  IAudioDeviceHandler,
} from '@core/tokens/audio-device-handler.token';
import { authReducer } from '@features/auth/auth.reducer';
import { AuthActions } from '@features/auth/auth.actions';
import {
  attachmentsDefaultMaxFileSize,
  attachmentsDefaultMaxFilesPerMessage,
  ESettingKey,
  EUserRole,
  TSetting,
} from '@konvoez/shared';
import { EStorageKey } from '../../app.enums';
import {
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
    },
  ];

  beforeEach(() => {
    localStorage.clear();

    apiService = {
      list: vi.fn().mockReturnValue(of(mockSettings)),
      update: vi.fn().mockReturnValue(of(mockSettings)),
    };

    audioDeviceHandler = {
      setAudioInput: vi.fn(),
      setAudioOutput: vi.fn(),
    };

    mockNotifications = {
      open: vi.fn().mockReturnValue(of(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: SettingsApiService, useValue: apiService },
        { provide: AUDIO_DEVICE_HANDLER, useValue: audioDeviceHandler },
        { provide: TuiNotificationService, useValue: mockNotifications },
        SettingsStore,
      ],
    });

    ngrxStore = TestBed.inject(Store);
    store = TestBed.inject(SettingsStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty settings and need initial setup', () => {
    expect(store.settings()).toEqual([]);
    expect(store.entities()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.audioInput()).toBeNull();
    expect(store.audioOutput()).toBeNull();
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

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: SettingsApiService, useValue: apiService },
        { provide: AUDIO_DEVICE_HANDLER, useValue: audioDeviceHandler },
        { provide: TuiNotificationService, useValue: mockNotifications },
        SettingsStore,
      ],
    });

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

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: SettingsApiService, useValue: apiService },
        { provide: AUDIO_DEVICE_HANDLER, useValue: audioDeviceHandler },
        { provide: TuiNotificationService, useValue: mockNotifications },
        SettingsStore,
      ],
    });

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

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        { provide: SettingsApiService, useValue: apiService },
        { provide: AUDIO_DEVICE_HANDLER, useValue: audioDeviceHandler },
        { provide: TuiNotificationService, useValue: mockNotifications },
        SettingsStore,
      ],
    });

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
    });
  });

  it('should fetch settings, populate entities and compute iceServers on loadAll', () => {
    store.loadAll();

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
          role: EUserRole.MEMBER,
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: null,
        },
      }),
    );

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
      },
    ];
    apiService.update.mockReturnValue(of(updatedSettings));

    store.updateSettings([
      { key: ESettingKey.INVITE_ONLY_SIGN_UP, value: false },
    ]);

    expect(apiService.update).toHaveBeenCalledWith([
      { key: ESettingKey.INVITE_ONLY_SIGN_UP, value: false },
    ]);
    expect(store.entityMap()[ESettingKey.INVITE_ONLY_SIGN_UP]).toEqual(
      updatedSettings[0],
    );
    expect(mockNotifications.open).toHaveBeenCalled();
  });
});
