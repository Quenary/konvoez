import {
  ChangeDetectorRef,
  DestroyRef,
  inject,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import dayjs, { ConfigType } from 'dayjs';
import dayjsLocalizedFormat from 'dayjs/plugin/localizedFormat';
import dayjsLocaleData from 'dayjs/plugin/localeData';
import { LocaleService } from '@core/services/locale.service';

dayjs.extend(dayjsLocalizedFormat);
dayjs.extend(dayjsLocaleData);

@Pipe({
  name: 'todayDayjs',
  pure: false,
})
export class TodayDayjsPipe implements PipeTransform {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localeService = inject(LocaleService);

  private lastValue: ConfigType = null;
  private lastFormat?: string;
  private lastShortFormat?: string;
  private lastLocale?: string;
  private lastTodayDateStr?: string;
  private lastResult: string | null = null;

  constructor() {
    this.localeService.onChange$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.changeDetectorRef.markForCheck();
      });
  }

  transform(value: ConfigType, format = 'L LTS', shortFormat = 'LT') {
    const locale =
      this.localeService.currentLanguage() ??
      (typeof navigator !== 'undefined' ? navigator.language : 'en');
    const todayDateStr = new Date().toDateString();

    if (
      value === this.lastValue &&
      format === this.lastFormat &&
      shortFormat === this.lastShortFormat &&
      locale === this.lastLocale &&
      todayDateStr === this.lastTodayDateStr
    ) {
      return this.lastResult;
    }

    this.lastValue = value;
    this.lastFormat = format;
    this.lastShortFormat = shortFormat;
    this.lastLocale = locale;
    this.lastTodayDateStr = todayDateStr;

    try {
      const djs = dayjs(value);
      if (djs.isValid()) {
        if (djs.isSame(dayjs(), 'day')) {
          this.lastResult = djs.locale(locale).format(shortFormat);
          return this.lastResult;
        }
        this.lastResult = djs.locale(locale).format(format);
        return this.lastResult;
      }
      this.lastResult = null;
      return null;
    } catch (e) {
      console.warn(e);
      this.lastResult = null;
      return null;
    }
  }
}
