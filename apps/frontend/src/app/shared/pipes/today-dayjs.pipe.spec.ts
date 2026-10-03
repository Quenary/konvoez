import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { TodayDayjsPipe } from './today-dayjs.pipe';

describe('TodayDayjsPipe', () => {
  let pipe: TodayDayjsPipe;

  beforeEach(() => {
    pipe = new TodayDayjsPipe();
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the short format for a timestamp from today', () => {
    const today = dayjs().hour(13).minute(5).second(9).millisecond(0).toDate();

    expect(pipe.transform(today)).toBe('1:05 PM');
  });

  it('uses the full format for a timestamp from another day', () => {
    const yesterday = dayjs()
      .subtract(1, 'day')
      .hour(13)
      .minute(5)
      .second(9)
      .millisecond(0)
      .toDate();

    expect(pipe.transform(yesterday)).toBe(
      dayjs(yesterday).locale('en').format('L LTS'),
    );
  });

  it('uses custom formats for today and other days', () => {
    const today = dayjs().hour(9).minute(0).second(0).millisecond(0).toDate();
    const otherDay = new Date(2020, 0, 15, 13, 5, 9);

    expect(pipe.transform(today, 'YYYY-MM-DD', 'HH:mm')).toBe('09:00');
    expect(pipe.transform(otherDay, 'YYYY-MM-DD', 'HH:mm')).toBe('2020-01-15');
  });

  it('formats using navigator.language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ru');
    const today = dayjs().hour(13).minute(5).second(9).millisecond(0).toDate();

    expect(pipe.transform(today)).toBe('13:05');
  });

  it('returns null for an invalid date', () => {
    expect(pipe.transform('not-a-date')).toBeNull();
    expect(pipe.transform(null)).toBeNull();
  });

  it('warns and returns null when formatting throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const value = {
      valueOf(): number {
        throw new Error('boom');
      },
    } as unknown as Date;

    expect(pipe.transform(value)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
