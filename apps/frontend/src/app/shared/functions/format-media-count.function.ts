import { EAttachmentKind } from '@konvoez/shared';
import { TranslateService } from '@ngx-translate/core';

/**
 * Returns a localized and pluralized label for an attachment type and count,
 * e.g. "22 изображения", "3 видео", "5 файлов", "2 аудио".
 */
export function formatMediaCount(
  kind: EAttachmentKind,
  count: number,
  translateService: TranslateService,
): string {
  const currentLangValue =
    typeof translateService.getCurrentLang === 'function'
      ? translateService.getCurrentLang()
      : typeof translateService.currentLang === 'function'
        ? translateService.currentLang()
        : translateService.currentLang;
  const lang = (currentLangValue as string) || 'ru';
  const categoryKey =
    kind === EAttachmentKind.IMAGE
      ? 'IMAGES'
      : kind === EAttachmentKind.VIDEO
        ? 'VIDEOS'
        : kind === EAttachmentKind.AUDIO
          ? 'AUDIO'
          : 'FILES';

  let rule: Intl.LDMLPluralRule;
  try {
    rule = new Intl.PluralRules(lang).select(count);
  } catch {
    rule = 'other';
  }

  const suffix = rule.toUpperCase();
  const specificKey = `ROOMS.MEDIA.${categoryKey}.${suffix}`;
  const translated = translateService.instant(specificKey, { count });
  if (translated !== specificKey) {
    return translated;
  }
  return translateService.instant(`ROOMS.MEDIA.${categoryKey}.OTHER`, {
    count,
  });
}
