import {
  ChangeDetectorRef,
  DestroyRef,
  inject,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import dayjs, { ConfigType } from 'dayjs';
import dayjsLocalizedFormat from 'dayjs/plugin/localizedFormat';
import dayjsLocaleData from 'dayjs/plugin/localeData';
import { interval, merge } from 'rxjs';
import { LocaleService } from '@core/services/locale.service';

dayjs.extend(dayjsLocalizedFormat);
dayjs.extend(dayjsLocaleData);

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const REFRESH_INTERVAL_MS = 30_000;

@Pipe({
  name: 'lastSeen',
  pure: false,
})
export class LastSeenPipe implements PipeTransform {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localeService = inject(LocaleService);
  private readonly translateService = inject(TranslateService);

  private lastValueMs: number | null = null;
  private lastLocale?: string;
  private lastBucketKey?: string;
  private lastResult: string | null = null;

  constructor() {
    merge(
      this.localeService.onChange$,
      this.translateService.onLangChange,
      interval(REFRESH_INTERVAL_MS),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.lastBucketKey = undefined;
        this.changeDetectorRef.markForCheck();
      });
  }

  public transform(value: ConfigType): string | null {
    const locale =
      this.localeService.currentLanguage() ??
      (typeof navigator !== 'undefined' ? navigator.language : 'en');

    if (value == null) {
      this.resetCache();
      return this.translateService.instant('PRESENCE.LAST_SEEN.LONG_TIME_AGO');
    }

    try {
      const djs = dayjs(value);
      if (!djs.isValid()) {
        this.resetCache();
        return null;
      }

      const seenMs = djs.valueOf();
      const diffMs = Math.max(0, Date.now() - seenMs);
      const bucketKey = this.getBucketKey(diffMs, seenMs);

      if (
        seenMs === this.lastValueMs &&
        locale === this.lastLocale &&
        bucketKey === this.lastBucketKey
      ) {
        return this.lastResult;
      }

      this.lastValueMs = seenMs;
      this.lastLocale = locale;
      this.lastBucketKey = bucketKey;

      if (diffMs < MINUTE_MS) {
        this.lastResult = this.translateService.instant(
          'PRESENCE.LAST_SEEN.JUST_NOW',
        );
        return this.lastResult;
      }

      if (diffMs < HOUR_MS) {
        const minutes = Math.floor(diffMs / MINUTE_MS);
        this.lastResult = this.translatePlural('MINUTES', minutes, locale);
        return this.lastResult;
      }

      if (diffMs < DAY_MS) {
        const hours = Math.floor(diffMs / HOUR_MS);
        this.lastResult = this.translatePlural('HOURS', hours, locale);
        return this.lastResult;
      }

      if (diffMs < WEEK_MS) {
        const days = Math.floor(diffMs / DAY_MS);
        this.lastResult = this.translatePlural('DAYS', days, locale);
        return this.lastResult;
      }

      const formattedDate = djs.locale(locale).format('L LTS');
      this.lastResult = this.translateService.instant('PRESENCE.LAST_SEEN.AT', {
        date: formattedDate,
      });
      return this.lastResult;
    } catch (e) {
      console.warn(e);
      this.resetCache();
      return null;
    }
  }

  private getBucketKey(diffMs: number, seenMs: number): string {
    if (diffMs < MINUTE_MS) {
      return 'just-now';
    }
    if (diffMs < HOUR_MS) {
      return `m:${Math.floor(diffMs / MINUTE_MS)}`;
    }
    if (diffMs < DAY_MS) {
      return `h:${Math.floor(diffMs / HOUR_MS)}`;
    }
    if (diffMs < WEEK_MS) {
      return `d:${Math.floor(diffMs / DAY_MS)}`;
    }
    return `date:${seenMs}`;
  }

  private translatePlural(
    unit: 'MINUTES' | 'HOURS' | 'DAYS',
    count: number,
    locale: string,
  ): string {
    let rule: Intl.LDMLPluralRule;
    try {
      rule = new Intl.PluralRules(locale).select(count);
    } catch {
      rule = 'other';
    }
    const suffix = rule.toUpperCase();
    const specificKey = `PRESENCE.LAST_SEEN.${unit}.${suffix}`;
    const translated = this.translateService.instant(specificKey, { count });
    if (translated !== specificKey) {
      return translated;
    }
    return this.translateService.instant(`PRESENCE.LAST_SEEN.${unit}.OTHER`, {
      count,
    });
  }

  private resetCache(): void {
    this.lastValueMs = null;
    this.lastLocale = undefined;
    this.lastBucketKey = undefined;
    this.lastResult = null;
  }
}
