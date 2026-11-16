import { inject, Injectable } from '@angular/core';
import { TUI_DARK_MODE } from '@taiga-ui/core';
import { TTheme } from '@shared/schemas/local-settings.schema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly darkMode = inject(TUI_DARK_MODE);

  public applyTheme(theme: TTheme): void {
    switch (theme) {
      case 'dark':
        this.darkMode.set(true);
        break;
      case 'light':
        this.darkMode.set(false);
        break;
      case 'auto':
      default:
        this.darkMode.reset();
        break;
    }
  }
}
