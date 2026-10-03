import { Pipe, PipeTransform } from '@angular/core';
import dayjs, { ConfigType } from 'dayjs';
import dayjsLocalizedFormat from 'dayjs/plugin/localizedFormat';
import dayjsLocaleData from 'dayjs/plugin/localeData';
dayjs.extend(dayjsLocalizedFormat);
dayjs.extend(dayjsLocaleData);

@Pipe({
  name: 'todayDayjs',
  pure: true,
})
export class TodayDayjsPipe implements PipeTransform {
  transform(value: ConfigType, format = 'L LTS', shortFormat = 'LT') {
    try {
      const djs = dayjs(value);
      if (djs.isValid()) {
        if (djs.isSame(dayjs(), 'day')) {
          return djs.locale(navigator.language).format(shortFormat);
        }
        return djs.locale(navigator.language).format(format);
      }
      return null;
    } catch (e) {
      console.warn(e);
      return null;
    }
  }
}
