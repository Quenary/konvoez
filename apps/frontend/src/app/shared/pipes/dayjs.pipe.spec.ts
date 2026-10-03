import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { DayjsPipe } from './dayjs.pipe';

describe('DayjsPipe', () => {
  let pipe: DayjsPipe;
  const date = new Date(2020, 0, 15, 13, 5, 9);

  beforeEach(() => {
    pipe = new DayjsPipe();
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats a valid date with the default locale format', () => {
    expect(pipe.transform(date)).toBe('01/15/2020 1:05:09 PM');
  });

  it('formats a valid date with a custom format', () => {
    expect(pipe.transform(date, 'YYYY-MM-DD')).toBe('2020-01-15');
  });

  it('formats using navigator.language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ru');

    expect(pipe.transform(date)).toBe('15.01.2020 13:05:09');
  });

  it('accepts an ISO string and a unix timestamp', () => {
    expect(pipe.transform(date.toISOString(), 'YYYY')).toBe(
      dayjs(date.toISOString()).format('YYYY'),
    );
    expect(pipe.transform(date.getTime(), 'YYYY-MM-DD')).toBe('2020-01-15');
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
