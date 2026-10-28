import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { PushNotificationService } from '@core/services/push-notification.service';
import { NotificationsApiService } from '@core/services/notifications-api.service';
import { TuiNotificationService } from '@taiga-ui/core';
import { SettingsNotificationsComponent } from './settings-notifications.component';
import { DEFAULT_USER_NOTIFICATION_SETTINGS } from '@konvoez/shared';

describe('SettingsNotificationsComponent', () => {
  let fixture: ComponentFixture<SettingsNotificationsComponent>;
  let component: SettingsNotificationsComponent;
  let isSupportedMock: ReturnType<typeof vi.fn>;
  let serverKeyLoaded: ReturnType<typeof signal<boolean>>;
  let serverAvailable: ReturnType<typeof signal<boolean>>;
  let isEnabled: ReturnType<typeof signal<boolean>>;
  let loadServerKey: ReturnType<typeof vi.fn>;
  let getSettings: ReturnType<typeof vi.fn>;
  let updateSettings: ReturnType<typeof vi.fn>;
  let openNotification: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isSupportedMock = vi.fn(() => true);
    serverKeyLoaded = signal(false);
    serverAvailable = signal(false);
    isEnabled = signal(false);
    loadServerKey = vi.fn(() => of(null));
    getSettings = vi.fn(() => of(DEFAULT_USER_NOTIFICATION_SETTINGS));
    updateSettings = vi.fn((payload) =>
      of({ ...DEFAULT_USER_NOTIFICATION_SETTINGS, ...payload }),
    );
    openNotification = vi.fn(() => of(null));

    await TestBed.configureTestingModule({
      imports: [SettingsNotificationsComponent],
      providers: [
        provideTranslateService(),
        {
          provide: PushNotificationService,
          useValue: {
            isSupported: isSupportedMock,
            isEnabled,
            serverKeyLoaded,
            serverAvailable,
            loadServerKey,
            enable: vi.fn(() => of('enabled')),
            disable: vi.fn(() => of('disabled')),
            notifyToggleError: vi.fn(),
          },
        },
        {
          provide: NotificationsApiService,
          useValue: {
            getSettings,
            updateSettings,
          },
        },
        {
          provide: TuiNotificationService,
          useValue: {
            open: openNotification,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsNotificationsComponent);
    component = fixture.componentInstance;
  });

  it('loads server availability and user settings when opened', () => {
    expect(loadServerKey).toHaveBeenCalledOnce();
    expect(getSettings).toHaveBeenCalledOnce();

    serverKeyLoaded.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('button[tuiButton]');
    expect(compiled.textContent).toContain(
      'SETTINGS.NOTIFICATIONS.SERVER_DISABLED',
    );
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('allows disabling an existing subscription when the server is unavailable', () => {
    serverKeyLoaded.set(true);
    isEnabled.set(true);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    );
    expect(button?.hasAttribute('disabled')).toBe(false);
  });

  it('enables the toggle after a server key becomes available', () => {
    serverKeyLoaded.set(true);
    serverAvailable.set(true);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    );
    expect(button?.hasAttribute('disabled')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'SETTINGS.NOTIFICATIONS.SERVER_DISABLED',
    );
  });

  it('disables topic settings fieldset while settings are loading', () => {
    component['isSettingsLoading'].set(true);
    fixture.detectChanges();

    const fieldset = (fixture.nativeElement as HTMLElement).querySelector(
      'fieldset.setting-group',
    );
    expect(fieldset?.hasAttribute('disabled')).toBe(true);

    component['isSettingsLoading'].set(false);
    fixture.detectChanges();
    expect(fieldset?.hasAttribute('disabled')).toBe(false);
  });

  it('hides push section completely when push is not supported', () => {
    component['isSupported'].set(false);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.push-section')).toBeNull();
    expect(compiled.querySelector('button[tuiButton]')).toBeNull();
    expect(compiled.querySelector('fieldset.setting-group')).not.toBeNull();
  });

  it('shows error state, disables fieldset, and shows retry button when settings fail to load', () => {
    getSettings.mockClear();
    getSettings.mockReturnValueOnce(throwError(() => new Error('Load failed')));

    const freshFixture = TestBed.createComponent(
      SettingsNotificationsComponent,
    );
    const freshComponent = freshFixture.componentInstance;
    freshFixture.detectChanges();

    expect(freshComponent['settingsLoadFailed']()).toBe(true);
    expect(openNotification).toHaveBeenCalled();

    const compiled = freshFixture.nativeElement as HTMLElement;
    const fieldset = compiled.querySelector('fieldset.setting-group');
    expect(fieldset?.hasAttribute('disabled')).toBe(true);

    const retryButton = compiled.querySelector(
      '.settings-load-error button[tuiButton]',
    );
    expect(retryButton).not.toBeNull();
  });

  it('retries loading settings when clicking retry button', () => {
    getSettings.mockClear();
    getSettings.mockReturnValueOnce(throwError(() => new Error('Load failed')));

    const freshFixture = TestBed.createComponent(
      SettingsNotificationsComponent,
    );
    const freshComponent = freshFixture.componentInstance;
    freshFixture.detectChanges();

    expect(freshComponent['settingsLoadFailed']()).toBe(true);

    getSettings.mockReturnValueOnce(
      of({ ...DEFAULT_USER_NOTIFICATION_SETTINGS, directCalls: false }),
    );

    const compiled = freshFixture.nativeElement as HTMLElement;
    const retryButton = compiled.querySelector(
      '.settings-load-error button[tuiButton]',
    ) as HTMLButtonElement;
    retryButton.click();
    freshFixture.detectChanges();

    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(freshComponent['settings']().directCalls).toBe(false);
    expect(freshComponent['settingsLoadFailed']()).toBe(false);

    const fieldset = compiled.querySelector('fieldset.setting-group');
    expect(fieldset?.hasAttribute('disabled')).toBe(false);
  });

  it('updates direct messages setting and calls api', () => {
    component['onUpdateDirectMessages'](false);

    expect(component['settings']().directMessages).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({ directMessages: false });
  });

  it('updates direct calls setting and calls api', () => {
    component['onUpdateDirectCalls'](false);

    expect(component['settings']().directCalls).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({ directCalls: false });
  });

  it('updates replies setting and calls api', () => {
    component['onUpdateReplies'](false);

    expect(component['settings']().replies).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({ replies: false });
  });

  it('updates reactions setting and calls api', () => {
    component['onUpdateReactions'](false);

    expect(component['settings']().reactions).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({ reactions: false });
  });

  it('updates mention settings and calls api', () => {
    component['onUpdateMention']('everyone', false);

    expect(component['settings']().mentions.everyone).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({
      mentions: { everyone: false },
    });
  });

  it('reloads settings from the server and shows notification when update fails', () => {
    updateSettings.mockReturnValueOnce(
      throwError(() => new Error('Save failed')),
    );
    getSettings.mockReturnValueOnce(
      of({ ...DEFAULT_USER_NOTIFICATION_SETTINGS, directCalls: false }),
    );

    component['onUpdateDirectMessages'](false);

    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(component['settings']()).toEqual({
      ...DEFAULT_USER_NOTIFICATION_SETTINGS,
      directCalls: false,
    });
    expect(openNotification).toHaveBeenCalled();
  });
});
