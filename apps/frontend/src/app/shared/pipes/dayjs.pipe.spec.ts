import { ChangeDetectorRef, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { Subject } from 'rxjs';
import { LocaleService } from '@core/services/locale.service';
import { type TLanguage } from '@konvoez/shared';
import { DayjsPipe } from './dayjs.pipe';

describe('DayjsPipe', () => {
  let pipe: DayjsPipe;
  let currentLanguageSignal: WritableSignal<TLanguage>;
  let onChangeSubject: Subject<TLanguage>;
  let changeDetectorRefMock: { markForCheck: ReturnType<typeof vi.fn> };
  const date = new Date(2020, 0, 15, 13, 5, 9);

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

    pipe = TestBed.runInInjectionContext(() => new DayjsPipe());
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

  it('formats using current language from LocaleService', () => {
    currentLanguageSignal.set('ru');

    expect(pipe.transform(date)).toBe('15.01.2020 13:05:09');
  });

  it('marks change detector for check when locale changes', () => {
    onChangeSubject.next('ru');

    expect(changeDetectorRefMock.markForCheck).toHaveBeenCalled();
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

  it('returns memoized result when called with identical arguments', () => {
    const first = pipe.transform(date, 'YYYY-MM-DD');
    const second = pipe.transform(date, 'YYYY-MM-DD');
    expect(first).toBe('2020-01-15');
    expect(second).toBe(first);
  });
});
