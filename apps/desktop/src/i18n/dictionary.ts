import {
  desktopTranslations,
  createDesktopTranslator,
  type TDesktopI18nKey,
} from '@konvoez/client-shell';

export const translations = desktopTranslations;
export type TI18nKey = TDesktopI18nKey;
export const desktopTranslator = createDesktopTranslator('en');
