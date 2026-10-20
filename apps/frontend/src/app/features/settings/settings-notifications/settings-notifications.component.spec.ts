import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { PushNotificationService } from '@core/services/push-notification.service';
import { SettingsNotificationsComponent } from './settings-notifications.component';

describe('SettingsNotificationsComponent', () => {
  let fixture: ComponentFixture<SettingsNotificationsComponent>;
  let serverKeyLoaded: ReturnType<typeof signal<boolean>>;
  let serverAvailable: ReturnType<typeof signal<boolean>>;
  let isEnabled: ReturnType<typeof signal<boolean>>;
  let loadServerKey: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    serverKeyLoaded = signal(false);
    serverAvailable = signal(false);
    isEnabled = signal(false);
    loadServerKey = vi.fn(() => of(null));

    await TestBed.configureTestingModule({
      imports: [SettingsNotificationsComponent],
      providers: [
        provideTranslateService(),
        {
          provide: PushNotificationService,
          useValue: {
            isSupported: () => true,
            isEnabled,
            serverKeyLoaded,
            serverAvailable,
            loadServerKey,
            enable: vi.fn(() => of('enabled')),
            disable: vi.fn(() => of('disabled')),
            notifyToggleError: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsNotificationsComponent);
  });

  it('loads server availability when opened and explains when push is unavailable', () => {
    expect(loadServerKey).toHaveBeenCalledOnce();

    serverKeyLoaded.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('button');
    expect(compiled.textContent).toContain(
      'SETTINGS.NOTIFICATIONS.SERVER_DISABLED',
    );
    expect(button?.disabled).toBe(true);
  });

  it('allows disabling an existing subscription when the server is unavailable', () => {
    serverKeyLoaded.set(true);
    isEnabled.set(true);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    );
    expect(button?.disabled).toBe(false);
  });

  it('enables the toggle after a server key becomes available', () => {
    serverKeyLoaded.set(true);
    serverAvailable.set(true);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    );
    expect(button?.disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'SETTINGS.NOTIFICATIONS.SERVER_DISABLED',
    );
  });
});
