import { ChangeDetectorRef, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Subject } from 'rxjs';
import { parse } from 'yaml';
import { LocaleService } from '@core/services/locale.service';
import { type TLanguage } from '@konvoez/shared';
import { LastSeenPipe } from './last-seen.pipe';

function getI18nDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'apps/frontend/public/i18n'),
    path.resolve(__dirname, '../../../../../../public/i18n'),
    path.resolve(__dirname, '../../../../../public/i18n'),
    path.resolve(__dirname, '../../../../public/i18n'),
  ];
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) {
    throw new Error(
      `i18n directory not found in candidates: ${candidates.join(', ')}`,
    );
  }
  return found;
}

function loadTranslations(lang: 'en' | 'ru'): Record<string, unknown> {
  const yamlPath = path.join(getI18nDir(), `${lang}.yaml`);
  return parse(fs.readFileSync(yamlPath, 'utf-8')) as Record<string, unknown>;
}

function resolveKey(
  tree: Record<string, unknown>,
  dottedKey: string,
): string | undefined {
  let current: unknown = tree;
  for (const part of dottedKey.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !(part in (current as Record<string, unknown>))
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

const enTranslations = loadTranslations('en');
const ruTranslations = loadTranslations('ru');

describe('LastSeenPipe', () => {
  let pipe: LastSeenPipe;
  let currentLanguageSignal: WritableSignal<TLanguage>;
  let onChangeSubject: Subject<TLanguage>;
  let onLangChangeSubject: Subject<{ lang: string; translations: unknown }>;
  let changeDetectorRefMock: { markForCheck: ReturnType<typeof vi.fn> };
  let translateMock: {
    onLangChange: ReturnType<typeof onLangChangeSubject.asObservable>;
    instant: ReturnType<typeof vi.fn>;
  };

  const now = new Date('2026-06-15T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    currentLanguageSignal = signal<TLanguage>('en');
    onChangeSubject = new Subject<TLanguage>();
    onLangChangeSubject = new Subject<{
      lang: string;
      translations: unknown;
    }>();
    changeDetectorRefMock = { markForCheck: vi.fn() };

    translateMock = {
      onLangChange: onLangChangeSubject.asObservable(),
      instant: vi.fn((key: string, params?: Record<string, unknown>) => {
        const table =
          currentLanguageSignal() === 'ru' ? ruTranslations : enTranslations;
        let template = resolveKey(table, key) ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            template = template.replaceAll(`{{${k}}}`, String(v));
          }
        }
        return template;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: changeDetectorRefMock },
        {
          provide: LocaleService,
          useValue: {
            currentLanguage: currentLanguageSignal.asReadonly(),
            onChange$: onChangeSubject.asObservable(),
          },
        },
        { provide: TranslateService, useValue: translateMock },
      ],
    });

    pipe = TestBed.runInInjectionContext(() => new LastSeenPipe());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns "Last seen a long time ago" for null or undefined and null for invalid dates', () => {
    currentLanguageSignal.set('en');
    expect(pipe.transform(null)).toBe('Last seen a long time ago');
    expect(pipe.transform(undefined)).toBe('Last seen a long time ago');

    currentLanguageSignal.set('ru');
    expect(pipe.transform(null)).toBe('Был(а) в сети давно');
    expect(pipe.transform(undefined)).toBe('Был(а) в сети давно');

    expect(pipe.transform('invalid-date')).toBeNull();
  });

  it.each([
    {
      offsetMs: 0,
      expectedEn: 'Last seen just now',
      expectedRu: 'Был(а) в сети только что',
    },
    {
      offsetMs: 45_000,
      expectedEn: 'Last seen just now',
      expectedRu: 'Был(а) в сети только что',
    },
    {
      offsetMs: -5_000,
      expectedEn: 'Last seen just now',
      expectedRu: 'Был(а) в сети только что',
    },
    {
      offsetMs: 60_000,
      expectedEn: 'Last seen 1 minute ago',
      expectedRu: 'Был(а) в сети 1 минуту назад',
    },
    {
      offsetMs: 2 * 60_000,
      expectedEn: 'Last seen 2 minutes ago',
      expectedRu: 'Был(а) в сети 2 минуты назад',
    },
    {
      offsetMs: 5 * 60_000,
      expectedEn: 'Last seen 5 minutes ago',
      expectedRu: 'Был(а) в сети 5 минут назад',
    },
    {
      offsetMs: 59 * 60_000,
      expectedEn: 'Last seen 59 minutes ago',
      expectedRu: 'Был(а) в сети 59 минут назад',
    },
    {
      offsetMs: 60 * 60_000,
      expectedEn: 'Last seen 1 hour ago',
      expectedRu: 'Был(а) в сети 1 час назад',
    },
    {
      offsetMs: 2 * 60 * 60_000,
      expectedEn: 'Last seen 2 hours ago',
      expectedRu: 'Был(а) в сети 2 часа назад',
    },
    {
      offsetMs: 5 * 60 * 60_000,
      expectedEn: 'Last seen 5 hours ago',
      expectedRu: 'Был(а) в сети 5 часов назад',
    },
    {
      offsetMs: 23 * 60 * 60_000,
      expectedEn: 'Last seen 23 hours ago',
      expectedRu: 'Был(а) в сети 23 часа назад',
    },
    {
      offsetMs: 24 * 60 * 60_000 - 1_000,
      expectedEn: 'Last seen 23 hours ago',
      expectedRu: 'Был(а) в сети 23 часа назад',
    },
    {
      offsetMs: 24 * 60 * 60_000,
      expectedEn: 'Last seen 1 day ago',
      expectedRu: 'Был(а) в сети 1 день назад',
    },
    {
      offsetMs: 2 * 24 * 60 * 60_000,
      expectedEn: 'Last seen 2 days ago',
      expectedRu: 'Был(а) в сети 2 дня назад',
    },
    {
      offsetMs: 3 * 24 * 60 * 60_000,
      expectedEn: 'Last seen 3 days ago',
      expectedRu: 'Был(а) в сети 3 дня назад',
    },
    {
      offsetMs: 4 * 24 * 60 * 60_000,
      expectedEn: 'Last seen 4 days ago',
      expectedRu: 'Был(а) в сети 4 дня назад',
    },
    {
      offsetMs: 5 * 24 * 60 * 60_000,
      expectedEn: 'Last seen 5 days ago',
      expectedRu: 'Был(а) в сети 5 дней назад',
    },
    {
      offsetMs: 6 * 24 * 60 * 60_000,
      expectedEn: 'Last seen 6 days ago',
      expectedRu: 'Был(а) в сети 6 дней назад',
    },
    {
      offsetMs: 7 * 24 * 60 * 60_000 - 1_000,
      expectedEn: 'Last seen 6 days ago',
      expectedRu: 'Был(а) в сети 6 дней назад',
    },
  ])(
    'formats offset $offsetMs ms in English and Russian',
    ({ offsetMs, expectedEn, expectedRu }) => {
      const seenAt = new Date(now - offsetMs);

      currentLanguageSignal.set('en');
      expect(pipe.transform(seenAt)).toBe(expectedEn);

      currentLanguageSignal.set('ru');
      expect(pipe.transform(seenAt)).toBe(expectedRu);
    },
  );

  it('formats full localized date after 7 days', () => {
    const seenAt = new Date(now - 7 * 24 * 60 * 60_000);
    const expectedDateEn = dayjs(seenAt).locale('en').format('L LTS');
    const expectedDateRu = dayjs(seenAt).locale('ru').format('L LTS');

    currentLanguageSignal.set('en');
    expect(pipe.transform(seenAt)).toBe(`Last seen ${expectedDateEn}`);

    currentLanguageSignal.set('ru');
    expect(pipe.transform(seenAt)).toBe(`Был(а) в сети ${expectedDateRu}`);
  });

  it('marks for check when locale changes, language changes, or refresh interval fires', () => {
    onChangeSubject.next('ru');
    expect(changeDetectorRefMock.markForCheck).toHaveBeenCalledTimes(1);

    onLangChangeSubject.next({ lang: 'ru', translations: {} });
    expect(changeDetectorRefMock.markForCheck).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_000);
    expect(changeDetectorRefMock.markForCheck).toHaveBeenCalledTimes(3);
  });

  it('updates relative label when time advances across minute boundary', () => {
    const seenAt = new Date(now - 50_000);
    expect(pipe.transform(seenAt)).toBe('Last seen just now');

    vi.advanceTimersByTime(30_000);
    expect(pipe.transform(seenAt)).toBe('Last seen 1 minute ago');
  });

  it('updates relative label when time advances from 6 days to 7 days', () => {
    const seenAt = new Date(now - (7 * 24 * 60 * 60_000 - 15_000));
    expect(pipe.transform(seenAt)).toBe('Last seen 6 days ago');

    vi.advanceTimersByTime(30_000);
    const expectedDateEn = dayjs(seenAt).locale('en').format('L LTS');
    expect(pipe.transform(seenAt)).toBe(`Last seen ${expectedDateEn}`);
  });

  it('caches formatted result within the same day bucket and invalidates on lang change', () => {
    const seenAt = new Date(now - 3 * 24 * 60 * 60_000);
    expect(pipe.transform(seenAt)).toBe('Last seen 3 days ago');
    expect(translateMock.instant).toHaveBeenCalledTimes(1);

    expect(pipe.transform(seenAt)).toBe('Last seen 3 days ago');
    expect(translateMock.instant).toHaveBeenCalledTimes(1);

    onLangChangeSubject.next({ lang: 'en', translations: {} });
    expect(pipe.transform(seenAt)).toBe('Last seen 3 days ago');
    expect(translateMock.instant).toHaveBeenCalledTimes(2);
  });
});
