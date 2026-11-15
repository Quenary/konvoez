import { ChangeDetectorRef, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { Subject } from 'rxjs';
import { LocaleService } from '@core/services/locale.service';
import { type TLanguage } from '@konvoez/shared';
import { TodayDayjsPipe } from './today-dayjs.pipe';

describe('TodayDayjsPipe', () => {
  let pipe: TodayDayjsPipe;
  let currentLanguageSignal: WritableSignal<TLanguage>;
  let onChangeSubject: Subject<TLanguage>;
  let changeDetectorRefMock: { markForCheck: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    currentLanguageSignal = signal<TLanguage>('en');
    onChangeSubject = new Subject<TLanguage>();
    changeDetectorRefMock = { markForCheck: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ChangeDetectorRef,
          useValue: changeDetectorRefMock,
        },
        {
          provide: LocaleService,
          useValue: {
            currentLanguage: currentLanguageSignal.asReadonly(),
            onChange$: onChangeSubject.asObservable(),
          },
        },
      ],
    });

    pipe = TestBed.runInInjectionContext(() => new TodayDayjsPipe());
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

  it('formats using current language from LocaleService', () => {
    currentLanguageSignal.set('ru');
    const today = dayjs().hour(13).minute(5).second(9).millisecond(0).toDate();

    expect(pipe.transform(today)).toBe('13:05');
  });

  it('marks change detector for check when locale changes', () => {
    onChangeSubject.next('ru');

    expect(changeDetectorRefMock.markForCheck).toHaveBeenCalled();
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

  it('returns memoized result when called with identical arguments', () => {
    const otherDay = new Date(2020, 0, 15, 13, 5, 9);
    const first = pipe.transform(otherDay, 'YYYY-MM-DD', 'HH:mm');
    const second = pipe.transform(otherDay, 'YYYY-MM-DD', 'HH:mm');
    expect(first).toBe('2020-01-15');
    expect(second).toBe(first);
  });
});
