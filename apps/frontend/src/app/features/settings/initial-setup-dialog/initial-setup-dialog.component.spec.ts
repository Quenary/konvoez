import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { TuiDialogContext, TUI_OPTIONS } from '@taiga-ui/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '@core/stores/settings.store';
import { InitialSetupDialogComponent } from './initial-setup-dialog.component';
import { SettingsAppearanceComponent } from '../settings-appearance/settings-appearance.component';
import { SettingsNotificationsComponent } from '../settings-notifications/settings-notifications.component';
import { SettingsDevicesComponent } from '../settings-devices/settings-devices.component';

@Component({
  selector: 'app-settings-appearance',
  template: '',
})
class MockSettingsAppearanceComponent {}

@Component({
  selector: 'app-settings-notifications',
  template: '',
})
class MockSettingsNotificationsComponent {
  public readonly compact = input<boolean>(false);
}

@Component({
  selector: 'app-settings-devices',
  template: '',
})
class MockSettingsDevicesComponent {
  public readonly compact = input<boolean>(false);
}

describe('InitialSetupDialogComponent', () => {
  let fixture: ComponentFixture<InitialSetupDialogComponent>;
  let component: InitialSetupDialogComponent;
  let persistLocalSettingsMock: ReturnType<typeof vi.fn>;
  const completeWithMock = vi.fn<(value: boolean) => void>();

  const mockDialogContext: Partial<TuiDialogContext<boolean, void>> = {
    completeWith: completeWithMock,
  };

  beforeEach(async () => {
    persistLocalSettingsMock = vi.fn();
    completeWithMock.mockClear();

    await TestBed.configureTestingModule({
      imports: [InitialSetupDialogComponent],
      providers: [
        {
          provide: TUI_OPTIONS,
          useValue: {
            apis: 'stable',
            fontScaling: false,
            scrollbars: 'native',
          },
        },
        provideTranslateService(),
        {
          provide: SettingsStore,
          useValue: {
            persistLocalSettings: persistLocalSettingsMock,
          },
        },
        {
          provide: POLYMORPHEUS_CONTEXT,
          useValue: mockDialogContext,
        },
      ],
    })
      .overrideComponent(InitialSetupDialogComponent, {
        remove: {
          imports: [
            SettingsAppearanceComponent,
            SettingsNotificationsComponent,
            SettingsDevicesComponent,
          ],
        },
        add: {
          imports: [
            MockSettingsAppearanceComponent,
            MockSettingsNotificationsComponent,
            MockSettingsDevicesComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(InitialSetupDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component and renders appearance, notifications, and devices in order', () => {
    expect(component).toBeTruthy();

    const root = fixture.nativeElement as HTMLElement;
    const appearanceEl = root.querySelector('app-settings-appearance');
    const notificationsEl = root.querySelector('app-settings-notifications');
    const devicesEl = root.querySelector('app-settings-devices');

    expect(appearanceEl).not.toBeNull();
    expect(notificationsEl).not.toBeNull();
    expect(devicesEl).not.toBeNull();

    const notificationsDebug = fixture.debugElement.query(
      By.directive(MockSettingsNotificationsComponent),
    );
    const notificationsInstance =
      notificationsDebug.componentInstance as MockSettingsNotificationsComponent;
    expect(notificationsInstance.compact()).toBe(true);

    const devicesDebug = fixture.debugElement.query(
      By.directive(MockSettingsDevicesComponent),
    );
    const devicesInstance =
      devicesDebug.componentInstance as MockSettingsDevicesComponent;
    expect(devicesInstance.compact()).toBe(true);
  });

  it('persists settings and completes context when clicking continue', () => {
    const continueButton = (fixture.nativeElement as HTMLElement).querySelector(
      'button[tuiButton]',
    ) as HTMLButtonElement;
    expect(continueButton).not.toBeNull();

    continueButton.click();

    expect(persistLocalSettingsMock).toHaveBeenCalledOnce();
    expect(completeWithMock).toHaveBeenCalledWith(true);
  });
});
