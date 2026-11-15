import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TUI_OPTIONS } from '@taiga-ui/core';
import { icons } from '@constants';
import { AuthActions } from '@core/auth/auth.actions';
import { SettingsStore } from '@core/stores/settings.store';
import { type TLanguage } from '@konvoez/shared';
import { type TTheme } from '@shared/schemas/local-settings.schema';
import { SettingsAppearanceComponent } from './settings-appearance.component';

describe('SettingsAppearanceComponent', () => {
  let fixture: ComponentFixture<SettingsAppearanceComponent>;
  let component: SettingsAppearanceComponent;
  let themeSignal: ReturnType<typeof signal<TTheme>>;
  let languageSignal: ReturnType<typeof signal<TLanguage | null>>;
  let setThemeMock: ReturnType<typeof vi.fn>;
  let setLanguageMock: ReturnType<typeof vi.fn>;
  let mockStore: MockStore;
  let translateService: TranslateService;

  beforeEach(async () => {
    themeSignal = signal<TTheme>('auto');
    languageSignal = signal<TLanguage | null>(null);
    setThemeMock = vi.fn((theme: TTheme) => themeSignal.set(theme));
    setLanguageMock = vi.fn((lang: TLanguage | null) =>
      languageSignal.set(lang),
    );

    await TestBed.configureTestingModule({
      imports: [SettingsAppearanceComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideMockStore(),
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
            language: languageSignal.asReadonly(),
            setLanguage: setLanguageMock,
          },
        },
      ],
    }).compileComponents();

    translateService = TestBed.inject(TranslateService);
    vi.spyOn(translateService, 'instant').mockImplementation(
      (key: string | string[]) =>
        Array.isArray(key) ? key.join(',') : `translated:${key}`,
    );

    mockStore = TestBed.inject(MockStore);
    vi.spyOn(mockStore, 'dispatch');

    fixture = TestBed.createComponent(SettingsAppearanceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('does not render description subtitles for appearance settings', () => {
    expect(
      fixture.nativeElement.querySelector('.setting-item-description'),
    ).toBeNull();
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

  it('calls settingsStore.setLanguage and dispatches patchUser', () => {
    component['onSelectLanguage']('ru');
    expect(setLanguageMock).toHaveBeenCalledWith('ru');
    expect(mockStore.dispatch).toHaveBeenCalledWith(
      AuthActions.requestPatchUser({ body: { language: 'ru' } }),
    );
  });

  it('calls settingsStore.setLanguage with null when selecting auto or null', () => {
    component['onSelectLanguage']('auto');
    expect(setLanguageMock).toHaveBeenCalledWith(null);
    expect(mockStore.dispatch).toHaveBeenCalledWith(
      AuthActions.requestPatchUser({ body: { language: null } }),
    );

    setLanguageMock.mockClear();
    vi.mocked(mockStore.dispatch).mockClear();

    component['onSelectLanguage'](null);
    expect(setLanguageMock).toHaveBeenCalledWith(null);
    expect(mockStore.dispatch).toHaveBeenCalledWith(
      AuthActions.requestPatchUser({ body: { language: null } }),
    );
  });

  it('computes selectedLanguage as auto when language is null', () => {
    expect(component['selectedLanguage']()).toBe('auto');

    languageSignal.set('ru');
    fixture.detectChanges();
    expect(component['selectedLanguage']()).toBe('ru');

    languageSignal.set('en');
    fixture.detectChanges();
    expect(component['selectedLanguage']()).toBe('en');

    languageSignal.set(null);
    fixture.detectChanges();
    expect(component['selectedLanguage']()).toBe('auto');
  });

  it('provides stringifyTheme to format theme labels', () => {
    const stringifyTheme = component['stringifyTheme']();
    expect(stringifyTheme('auto')).toBe(
      'translated:SETTINGS.APPEARANCE.THEME_AUTO',
    );
    expect(stringifyTheme('dark')).toBe(
      'translated:SETTINGS.APPEARANCE.THEME_DARK',
    );
    expect(stringifyTheme('light')).toBe(
      'translated:SETTINGS.APPEARANCE.THEME_LIGHT',
    );
    expect(stringifyTheme(null)).toBe('');
    expect(stringifyTheme(undefined)).toBe('');
  });

  it('provides stringifyLanguage to format language labels', () => {
    const stringifyLanguage = component['stringifyLanguage']();
    expect(stringifyLanguage('auto')).toBe(
      'translated:SETTINGS.APPEARANCE.LANGUAGE_AUTO',
    );
    expect(stringifyLanguage(null)).toBe(
      'translated:SETTINGS.APPEARANCE.LANGUAGE_AUTO',
    );
    expect(stringifyLanguage('en')).toBe('English');
    expect(stringifyLanguage('ru')).toBe('Русский');
    expect(stringifyLanguage(undefined)).toBe('');
  });

  it('renders translated Auto label in the select input when language is null', async () => {
    await fixture.whenStable();
    const inputs = fixture.nativeElement.querySelectorAll('input[tuiSelect]');
    expect(inputs.length).toBe(2);

    const themeInput = inputs[0] as HTMLInputElement;
    const languageInput = inputs[1] as HTMLInputElement;

    expect(themeInput.value).toBe('translated:SETTINGS.APPEARANCE.THEME_AUTO');
    expect(languageInput.value).toBe(
      'translated:SETTINGS.APPEARANCE.LANGUAGE_AUTO',
    );

    languageSignal.set('ru');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(languageInput.value).toBe('Русский');

    languageSignal.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(languageInput.value).toBe(
      'translated:SETTINGS.APPEARANCE.LANGUAGE_AUTO',
    );
  });

  it('updates theme select text when language changes', async () => {
    await fixture.whenStable();
    const inputs = fixture.nativeElement.querySelectorAll('input[tuiSelect]');
    const themeInput = inputs[0] as HTMLInputElement;
    expect(themeInput.value).toBe('translated:SETTINGS.APPEARANCE.THEME_AUTO');

    vi.spyOn(translateService, 'instant').mockImplementation(
      (key: string | string[]) =>
        Array.isArray(key) ? key.join(',') : `ru:${key}`,
    );

    translateService.use('ru');
    languageSignal.set('ru');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(themeInput.value).toBe('ru:SETTINGS.APPEARANCE.THEME_AUTO');
  });

  it('updates language select Auto text when language changes and language is auto', async () => {
    await fixture.whenStable();
    const inputs = fixture.nativeElement.querySelectorAll('input[tuiSelect]');
    const languageInput = inputs[1] as HTMLInputElement;
    expect(languageInput.value).toBe(
      'translated:SETTINGS.APPEARANCE.LANGUAGE_AUTO',
    );

    vi.spyOn(translateService, 'instant').mockImplementation(
      (key: string | string[]) =>
        Array.isArray(key) ? key.join(',') : `ru:${key}`,
    );

    translateService.use('ru');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(languageInput.value).toBe('ru:SETTINGS.APPEARANCE.LANGUAGE_AUTO');
  });
});
