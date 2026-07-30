import { LOCATION_INITIALIZED, registerLocaleData } from '@angular/common';
import { inject, EnvironmentInjector } from '@angular/core';
import { supportedLocales } from '../../app.constants';
import { AteI18nService } from '@flogeez/angular-tiptap-editor';

const importDayjsLocale = async (locale: string) => {
  switch (locale) {
    case 'ru':
      return import('dayjs/locale/ru');
    case 'de':
      return import('dayjs/locale/de');
    case 'fr':
      return import('dayjs/locale/fr');
    case 'ja':
      return import('dayjs/locale/ja');
    case 'it':
      return import('dayjs/locale/it');
    case 'es':
      return import('dayjs/locale/es');
    case 'zh':
      return import('dayjs/locale/zh');
    default:
      return import('dayjs/locale/en');
  }
};

const importAngularLocale = async (locale: string) => {
  switch (locale) {
    case 'ru':
      return import('@angular/common/locales/ru');
    case 'de':
      return import('@angular/common/locales/de');
    case 'fr':
      return import('@angular/common/locales/fr');
    case 'ja':
      return import('@angular/common/locales/ja');
    case 'it':
      return import('@angular/common/locales/it');
    case 'es':
      return import('@angular/common/locales/es');
    case 'zh':
      return import('@angular/common/locales/zh');
    default:
      return import('@angular/common/locales/en');
  }
};

const importTiptapLocale = async (locale: string) => {
  switch (locale) {
    case 'ru':
      return import('../tiptap-locales/ru');
    default:
      return Promise.resolve();
  }
};

export const localeInitializer = async () => {
  const environmentInjector = inject(EnvironmentInjector);
  const locationInitialized = environmentInjector.get(
    LOCATION_INITIALIZED,
    Promise.resolve(null),
  );
  const ateI18nService = environmentInjector.get(AteI18nService);
  await locationInitialized;
  let locale = navigator.language ? navigator.language.split('-')[0] : 'en';
  locale = supportedLocales.find((l) => l === locale) || 'en';
  await importDayjsLocale(locale);
  const al = await importAngularLocale(locale);
  registerLocaleData(al.default);
  const ttl = await importTiptapLocale(locale);
  if (ttl) {
    ateI18nService.addTranslations(locale, ttl.default as any);
  }
  ateI18nService.setLocale(locale);
};
