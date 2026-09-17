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
import { ESettingKey, EUserRole, TSetting } from '@konvoez/shared';
import { EStorageKey } from '../../app.enums';

describe('SettingsStore', () => {
  let store: InstanceType<typeof SettingsStore>;
  let apiService: {
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let audioDeviceHandler: IAudioDeviceHandler;
  let mockNotifications: { open: ReturnType<typeof vi.fn> };
  let ngrxStore: Store;

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

  it('should initialize with empty settings and null devices', () => {
    expect(store.settings()).toEqual([]);
    expect(store.entities()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.audioInput()).toBeNull();
    expect(store.audioOutput()).toBeNull();
    expect(store.iceServers()).toEqual([]);
  });

  it('should update audioInput, save to localStorage and call audioDeviceHandler', () => {
    const mockDevice = {
      deviceId: 'mic-1',
      label: 'Microphone 1',
    } as MediaDeviceInfo;

    store.setAudioInput(mockDevice);

    expect(store.audioInput()).toEqual(mockDevice);
    expect(audioDeviceHandler.setAudioInput).toHaveBeenCalledWith(mockDevice);
    expect(
      JSON.parse(localStorage.getItem(EStorageKey.AUDIO_INPUT) ?? '{}'),
    ).toEqual(mockDevice);
  });

  it('should update audioOutput, save to localStorage and call audioDeviceHandler', () => {
    const mockDevice = {
      deviceId: 'speaker-1',
      label: 'Speaker 1',
    } as MediaDeviceInfo;

    store.setAudioOutput(mockDevice);

    expect(store.audioOutput()).toEqual(mockDevice);
    expect(audioDeviceHandler.setAudioOutput).toHaveBeenCalledWith(mockDevice);
    expect(
      JSON.parse(localStorage.getItem(EStorageKey.AUDIO_OUTPUT) ?? '{}'),
    ).toEqual(mockDevice);
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
