import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import {
  TuiDropdown,
  TuiIcon,
  TuiLabel,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import {
  TuiChevron,
  TuiDataListWrapper,
  TuiFade,
  TuiSelect,
} from '@taiga-ui/kit';
import { TuiForm, TuiHeader } from '@taiga-ui/layout';
import { icons } from '@constants';
import { AuthActions } from '@core/auth/auth.actions';
import { SettingsStore } from '@core/stores/settings.store';
import { HeaderBackButtonComponent } from '@shared/components/header-back-button/header-back-button.component';
import { RoutePageComponent } from '@shared/components/route-page/route-page.component';
import { SUPPORTED_LANGUAGES, type TLanguage } from '@konvoez/shared';
import {
  themeSchema,
  type TTheme,
} from '@shared/schemas/local-settings.schema';

export type TLanguageOption = TLanguage | 'auto';

const LANGUAGE_LABELS: Record<TLanguage, string> = {
  en: 'English',
  ru: 'Русский',
};

@Component({
  selector: 'app-settings-appearance',
  imports: [
    HeaderBackButtonComponent,
    RoutePageComponent,
    FormsModule,
    TranslatePipe,
    TuiChevron,
    TuiDataListWrapper,
    TuiDropdown,
    TuiFade,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiLabel,
    TuiSelect,
    TuiTextfield,
    TuiTitle,
  ],
  templateUrl: './settings-appearance.component.html',
  styleUrl: './settings-appearance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsAppearanceComponent {
  private readonly settingsStore = inject(SettingsStore);
  private readonly store = inject(Store);
  private readonly translateService = inject(TranslateService);

  protected readonly icons = icons;
  protected readonly themes = themeSchema.options;
  protected readonly theme = this.settingsStore.theme;
  protected readonly languages: readonly TLanguageOption[] = [
    'auto',
    ...SUPPORTED_LANGUAGES,
  ];
  protected readonly language = this.settingsStore.language;

  protected readonly selectedLanguage = computed(() => {
    const language = this.language();
    return language ?? 'auto';
  });

  protected readonly themeIcon = computed(() => {
    const currentTheme = this.theme();
    switch (currentTheme) {
      case 'dark':
        return this.icons.moon;
      case 'light':
        return this.icons.sun;
      case 'auto':
      default:
        return this.icons['sun-moon'];
    }
  });

  protected readonly stringifyTheme = computed(() => {
    this.langChange();
    this.language();
    return (item: TTheme | null | undefined): string => {
      switch (item) {
        case 'auto':
          return this.translateService.instant(
            'SETTINGS.APPEARANCE.THEME_AUTO',
          );
        case 'dark':
          return this.translateService.instant(
            'SETTINGS.APPEARANCE.THEME_DARK',
          );
        case 'light':
          return this.translateService.instant(
            'SETTINGS.APPEARANCE.THEME_LIGHT',
          );
        default:
          return item ?? '';
      }
    };
  });

  protected readonly stringifyLanguage = computed(() => {
    this.langChange();
    this.language();
    return (item: TLanguageOption | null | undefined): string => {
      if (item === 'auto' || item === null) {
        return this.translateService.instant(
          'SETTINGS.APPEARANCE.LANGUAGE_AUTO',
        );
      }
      if (item && item in LANGUAGE_LABELS) {
        return LANGUAGE_LABELS[item as TLanguage];
      }
      return item ?? '';
    };
  });

  private readonly langChange = toSignal(this.translateService.onLangChange, {
    initialValue: null,
  });

  protected onSelectTheme(theme: TTheme): void {
    this.settingsStore.setTheme(theme);
  }

  protected onSelectLanguage(language: TLanguageOption | null): void {
    const nextLanguage = language === 'auto' ? null : language;
    this.settingsStore.setLanguage(nextLanguage);
    this.store.dispatch(
      AuthActions.requestPatchUser({ body: { language: nextLanguage } }),
    );
  }
}
