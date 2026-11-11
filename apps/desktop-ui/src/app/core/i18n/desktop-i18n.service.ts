import { Injectable, signal } from '@angular/core';
import { createDesktopTranslator, type TLanguage } from '@konvoez/client-shell';

@Injectable({ providedIn: 'root' })
export class DesktopI18nService {
  public readonly locale = signal<TLanguage>('en');

  private readonly translator = createDesktopTranslator('en');

  public setLanguage(lang: TLanguage): void {
    if (this.locale() !== lang) {
      this.locale.set(lang);
      this.translator.setLanguage(lang);
    }
  }

  public translate(key: string, params?: Record<string, string>): string {
    this.locale();
    return this.translator.t(key, params);
  }
}
