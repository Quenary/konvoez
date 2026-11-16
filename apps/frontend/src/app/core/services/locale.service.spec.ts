import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import {
  getBrowserLanguage,
  LocaleService,
  resolveLanguage,
} from './locale.service';

describe('locale.service', () => {
  describe('getBrowserLanguage', () => {
    it('resolves Russian locales', () => {
      expect(getBrowserLanguage('ru')).toBe('ru');
      expect(getBrowserLanguage('ru-RU')).toBe('ru');
      expect(getBrowserLanguage('ru_RU')).toBe('ru');
      expect(getBrowserLanguage('RU-KZ')).toBe('ru');
    });

    it('falls back to en for English and unsupported locales', () => {
      expect(getBrowserLanguage('en')).toBe('en');
      expect(getBrowserLanguage('en-US')).toBe('en');
      expect(getBrowserLanguage('de-DE')).toBe('en');
      expect(getBrowserLanguage('fr')).toBe('en');
      expect(getBrowserLanguage('')).toBe('en');
      expect(getBrowserLanguage(undefined)).toBe('en');
    });
  });

  describe('resolveLanguage', () => {
    it('returns explicitly specified language', () => {
      expect(resolveLanguage('ru')).toBe('ru');
      expect(resolveLanguage('en')).toBe('en');
    });

    it('falls back to browser language when null or undefined', () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('ru-RU');
      expect(resolveLanguage(null)).toBe('ru');
      expect(resolveLanguage(undefined)).toBe('ru');

      vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
      expect(resolveLanguage(null)).toBe('en');
    });
  });

  describe('LocaleService', () => {
    let service: LocaleService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [LocaleService],
      });
      service = TestBed.inject(LocaleService);
    });

    it('applies Russian locale and emits change', async () => {
      const emitted: string[] = [];
      service.onChange$.subscribe((lang) => emitted.push(lang));

      await service.apply('ru');

      expect(service.currentLanguage()).toBe('ru');
      expect(dayjs.locale()).toBe('ru');
      expect(emitted).toEqual(['ru']);
    });

    it('applies English locale and emits change', async () => {
      const emitted: string[] = [];
      service.onChange$.subscribe((lang) => emitted.push(lang));

      await service.apply('en');

      expect(service.currentLanguage()).toBe('en');
      expect(dayjs.locale()).toBe('en');
      expect(emitted).toEqual(['en']);
    });

    it('does not re-apply or emit when called with the same language', async () => {
      await service.apply('ru');

      const emitted: string[] = [];
      service.onChange$.subscribe((lang) => emitted.push(lang));

      await service.apply('ru');

      expect(emitted).toEqual([]);
    });

    it('deduplicates concurrent calls to apply with the same language', async () => {
      const emitted: string[] = [];
      service.onChange$.subscribe((lang) => emitted.push(lang));

      await Promise.all([service.apply('ru'), service.apply('ru')]);

      expect(emitted).toEqual(['ru']);
      expect(service.currentLanguage()).toBe('ru');
    });

    it('ensures the latest requested language wins when rapid concurrent calls occur', async () => {
      const p1 = service.apply('ru');
      const p2 = service.apply('en');

      await Promise.all([p1, p2]);

      expect(service.currentLanguage()).toBe('en');
      expect(dayjs.locale()).toBe('en');
    });
  });
});
