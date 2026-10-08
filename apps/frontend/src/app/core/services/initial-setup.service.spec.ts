import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideStore, Store } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { authReducer } from '@core/auth/auth.reducer';
import { AuthActions } from '@core/auth/auth.actions';
import { EUserRole } from '@konvoez/shared';
import {
  AUDIO_DEVICE_HANDLER,
  IAudioDeviceHandler,
} from '@core/tokens/audio-device-handler.token';
import { InitialSetupService } from './initial-setup.service';
import { SettingsApiService } from '@core/api/settings-api.service';
import { SettingsStore } from '@core/stores/settings.store';
import { EStorageKey } from '../../app.enums';
import { LOCAL_SETTINGS_VERSION } from '@shared/schemas/local-settings.schema';
import { PushNotificationService } from '@core/services/push-notification.service';

describe('InitialSetupService', () => {
  let dialogService: { open: ReturnType<typeof vi.fn> };
  let ngrxStore: Store;
  let dialogResult$: Subject<boolean>;

  const authorizedUser = {
    id: 1,
    username: 'tester',
    email: 'test@example.com',
    fullname: 'Test User',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const configure = (seedLocalSettings?: object) => {
    localStorage.clear();
    if (seedLocalSettings) {
      localStorage.setItem(
        EStorageKey.LOCAL_SETTINGS,
        JSON.stringify(seedLocalSettings),
      );
    }

    dialogResult$ = new Subject<boolean>();
    dialogService = {
      open: vi.fn().mockReturnValue(dialogResult$.asObservable()),
    };

    const audioDeviceHandler: IAudioDeviceHandler = {
      setAudioInput: vi.fn(),
      setAudioOutput: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideStore({ auth: authReducer }),
        provideTranslateService(),
        InitialSetupService,
        SettingsStore,
        {
          provide: SettingsApiService,
          useValue: { list: vi.fn().mockReturnValue(of([])), update: vi.fn() },
        },
        { provide: AUDIO_DEVICE_HANDLER, useValue: audioDeviceHandler },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn().mockReturnValue(of(null)) },
        },
        { provide: TuiDialogService, useValue: dialogService },
        {
          provide: PushNotificationService,
          useValue: {
            isSupported: () => false,
            isEnabled: () => false,
            enable: () => of('unsupported'),
            disable: () => of('disabled'),
          },
        },
      ],
    });

    ngrxStore = TestBed.inject(Store);
    TestBed.inject(InitialSetupService);
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    configure();
  });

  it('does not open dialog when user is not authorized', () => {
    ngrxStore.dispatch(AuthActions.initEnd({ user: null }));
    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it('opens dialog when authorized and local settings are missing', async () => {
    ngrxStore.dispatch(AuthActions.initEnd({ user: authorizedUser }));
    await vi.waitFor(() => expect(dialogService.open).toHaveBeenCalled(), {
      timeout: 5000,
    });
  });

  it('opens dialog when schema version mismatches', async () => {
    TestBed.resetTestingModule();
    configure({ version: 0 });

    ngrxStore.dispatch(AuthActions.initEnd({ user: authorizedUser }));
    await vi.waitFor(() => expect(dialogService.open).toHaveBeenCalled(), {
      timeout: 5000,
    });
  });

  it('does not open dialog when current schema version is stored', async () => {
    TestBed.resetTestingModule();
    configure({ version: LOCAL_SETTINGS_VERSION });

    ngrxStore.dispatch(AuthActions.initEnd({ user: authorizedUser }));
    await Promise.resolve();
    await Promise.resolve();
    expect(dialogService.open).not.toHaveBeenCalled();
  });
});
