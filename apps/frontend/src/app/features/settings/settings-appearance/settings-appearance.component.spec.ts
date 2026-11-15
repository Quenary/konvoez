import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { TUI_ITEMS_HANDLERS, TUI_OPTIONS } from '@taiga-ui/core';
import { SettingsStore } from '@core/stores/settings.store';
import { icons } from '@constants';
import { TTheme } from '@shared/schemas/local-settings.schema';
import { SettingsAppearanceComponent } from './settings-appearance.component';

describe('SettingsAppearanceComponent', () => {
  let fixture: ComponentFixture<SettingsAppearanceComponent>;
  let component: SettingsAppearanceComponent;
  let themeSignal: ReturnType<typeof signal<TTheme>>;
  let setThemeMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    themeSignal = signal<TTheme>('auto');
    setThemeMock = vi.fn((theme: TTheme) => themeSignal.set(theme));

    await TestBed.configureTestingModule({
      imports: [SettingsAppearanceComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        {
          provide: TUI_OPTIONS,
          useValue: {
            apis: 'stable',
            fontScaling: false,
            scrollbars: 'native',
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            theme: themeSignal.asReadonly(),
            setTheme: setThemeMock,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsAppearanceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('computes the correct theme icon based on current theme', () => {
    expect(component['themeIcon']()).toBe(icons['sun-moon']);

    themeSignal.set('dark');
    fixture.detectChanges();
    expect(component['themeIcon']()).toBe(icons.moon);

    themeSignal.set('light');
    fixture.detectChanges();
    expect(component['themeIcon']()).toBe(icons.sun);
  });

  it('calls settingsStore.setTheme when selecting a theme', () => {
    component['onSelectTheme']('dark');
    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('provides a stringify handler for theme labels', () => {
    const translateService = TestBed.inject(TranslateService);
    vi.spyOn(translateService, 'instant').mockImplementation(
      (key: string | string[]) =>
        Array.isArray(key) ? key.join(',') : `translated:${key}`,
    );

    const handlers = fixture.debugElement.injector.get(TUI_ITEMS_HANDLERS);
    const stringify = handlers.stringify();

    expect(stringify('auto')).toBe('translated:SETTINGS.APPEARANCE.THEME_AUTO');
    expect(stringify('dark')).toBe('translated:SETTINGS.APPEARANCE.THEME_DARK');
    expect(stringify('light')).toBe(
      'translated:SETTINGS.APPEARANCE.THEME_LIGHT',
    );
    expect(stringify(null)).toBe('');
  });
});
