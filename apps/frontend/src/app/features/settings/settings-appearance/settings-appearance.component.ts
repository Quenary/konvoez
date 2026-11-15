import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TUI_DEFAULT_ITEMS_HANDLERS,
  TUI_ITEMS_HANDLERS,
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
import { SettingsStore } from '@core/stores/settings.store';
import { HeaderBackButtonComponent } from '@shared/components/header-back-button/header-back-button.component';
import { RoutePageComponent } from '@shared/components/route-page/route-page.component';
import {
  themeSchema,
  type TTheme,
} from '@shared/schemas/local-settings.schema';

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
  providers: [
    {
      provide: TUI_ITEMS_HANDLERS,
      useFactory: () => {
        const translateService = inject(TranslateService);
        return {
          ...TUI_DEFAULT_ITEMS_HANDLERS,
          stringify: signal((item: TTheme | null | undefined): string => {
            if (!item) {
              return '';
            }
            switch (item) {
              case 'auto':
                return translateService.instant(
                  'SETTINGS.APPEARANCE.THEME_AUTO',
                );
              case 'dark':
                return translateService.instant(
                  'SETTINGS.APPEARANCE.THEME_DARK',
                );
              case 'light':
                return translateService.instant(
                  'SETTINGS.APPEARANCE.THEME_LIGHT',
                );
              default:
                return item;
            }
          }),
        };
      },
    },
  ],
  templateUrl: './settings-appearance.component.html',
  styleUrl: './settings-appearance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsAppearanceComponent {
  private readonly settingsStore = inject(SettingsStore);

  protected readonly icons = icons;
  protected readonly themes = themeSchema.options;
  protected readonly theme = this.settingsStore.theme;

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

  protected onSelectTheme(theme: TTheme): void {
    this.settingsStore.setTheme(theme);
  }
}
