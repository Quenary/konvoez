import { resolveLanguage, type TLanguage } from '@konvoez/client-shell';
import {
  desktopTranslator,
  translations,
  type TI18nKey,
} from '../i18n/dictionary';

export { desktopTranslator, translations, type TI18nKey };
export { resolveLanguage, type TLanguage };

export function getDictionary(locale?: string): Record<string, string> {
  const lang = resolveLanguage(locale);
  return translations[lang];
}

export function t(
  key: TI18nKey,
  locale?: string,
  params?: Record<string, string>,
): string {
  if (locale) {
    const lang = resolveLanguage(locale);
    let text: string = translations[lang][key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return text;
  }
  return desktopTranslator.t(key, params);
}
