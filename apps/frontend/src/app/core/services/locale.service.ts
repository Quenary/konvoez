import { registerLocaleData } from '@angular/common';
import { Injectable, signal, type Signal } from '@angular/core';
import dayjs from 'dayjs';
import { Observable, Subject } from 'rxjs';
import { FALLBACK_LANGUAGE, type TLanguage } from '@konvoez/shared';

export function getBrowserLanguage(
  locale = typeof navigator !== 'undefined' ? navigator.language : '',
): TLanguage {
  const code = (locale ?? '').split(/[-_]/)[0]?.toLowerCase();
  switch (code) {
    case 'ru':
      return 'ru';
    case 'en':
    default:
      return FALLBACK_LANGUAGE;
  }
}

export function resolveLanguage(lang: TLanguage | null | undefined): TLanguage {
  switch (lang) {
    case 'ru':
      return 'ru';
    case 'en':
      return 'en';
    default:
      return getBrowserLanguage();
  }
}

const importDayjsLocale = async (lang: TLanguage) => {
  switch (lang) {
    case 'ru':
      return import('dayjs/locale/ru');
    case 'en':
    default:
      return import('dayjs/locale/en');
  }
};

const importAngularLocale = async (lang: TLanguage) => {
  switch (lang) {
    case 'ru':
      return import('@angular/common/locales/ru');
    case 'en':
    default:
      return import('@angular/common/locales/en');
  }
};

@Injectable({
  providedIn: 'root',
})
export class LocaleService {
  public readonly currentLanguage: Signal<TLanguage>;
  public readonly onChange$: Observable<TLanguage>;

  private readonly _currentLanguage = signal<TLanguage>(FALLBACK_LANGUAGE);
  private readonly _onChange$ = new Subject<TLanguage>();
  private isLoaded = false;
  private pendingTarget: TLanguage | null = null;
  private pendingPromise: Promise<void> | null = null;
  private currentRequestId = 0;

  constructor() {
    this.currentLanguage = this._currentLanguage.asReadonly();
    this.onChange$ = this._onChange$.asObservable();
  }

  async apply(lang: TLanguage): Promise<void> {
    if (this.isLoaded && this._currentLanguage() === lang) {
      return;
    }
    if (this.pendingTarget === lang && this.pendingPromise) {
      return this.pendingPromise;
    }

    const requestId = ++this.currentRequestId;
    this.pendingTarget = lang;

    this.pendingPromise = (async () => {
      try {
        await importDayjsLocale(lang);
        const angularLocale = await importAngularLocale(lang);

        if (requestId !== this.currentRequestId) {
          return;
        }

        dayjs.locale(lang);
        registerLocaleData(angularLocale.default);
        this._currentLanguage.set(lang);
        this.isLoaded = true;
        this._onChange$.next(lang);
      } catch (error) {
        console.warn(
          `Failed to load locale "${lang}", falling back to "${FALLBACK_LANGUAGE}"`,
          error,
        );
        if (requestId !== this.currentRequestId) {
          return;
        }
        if (lang !== FALLBACK_LANGUAGE) {
          try {
            await importDayjsLocale(FALLBACK_LANGUAGE);
            const fallbackAngular =
              await importAngularLocale(FALLBACK_LANGUAGE);
            if (requestId === this.currentRequestId) {
              dayjs.locale(FALLBACK_LANGUAGE);
              registerLocaleData(fallbackAngular.default);
              this._currentLanguage.set(FALLBACK_LANGUAGE);
              this.isLoaded = true;
              this._onChange$.next(FALLBACK_LANGUAGE);
            }
          } catch (fallbackError) {
            console.error('Failed to load fallback locale', fallbackError);
          }
        }
      } finally {
        if (this.currentRequestId === requestId) {
          this.pendingTarget = null;
          this.pendingPromise = null;
        }
      }
    })();

    return this.pendingPromise;
  }
}
