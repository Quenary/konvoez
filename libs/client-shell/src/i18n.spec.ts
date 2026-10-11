import { describe, expect, it, vi } from 'vitest';
import { createTranslator, resolveLanguage } from './i18n';

describe('resolveLanguage', () => {
  it('resolves Russian locales to ru', () => {
    expect(resolveLanguage('ru-RU')).toBe('ru');
    expect(resolveLanguage('ru')).toBe('ru');
    expect(resolveLanguage('RU-kz')).toBe('ru');
  });

  it('resolves other locales to en fallback', () => {
    expect(resolveLanguage('de')).toBe('en');
    expect(resolveLanguage('en-US')).toBe('en');
    expect(resolveLanguage('')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
  });
});

describe('createTranslator', () => {
  const dicts = {
    en: {
      hello: 'Hello {name}!',
      shared: 'Shared in EN',
      onlyInEn: 'English only',
    },
    ru: {
      hello: 'Привет {name}!',
      shared: 'Общее на русском',
    },
  };

  it('translates existing keys and interpolates variables', () => {
    const translator = createTranslator(dicts, 'en');
    expect(translator.t('hello', { name: 'World' })).toBe('Hello World!');

    translator.setLanguage('ru');
    expect(translator.t('hello', { name: 'Мир' })).toBe('Привет Мир!');
  });

  it('falls back to en key when missing in current language', () => {
    const translator = createTranslator(dicts, 'ru');
    expect(translator.t('onlyInEn')).toBe('English only');
  });

  it('falls back to key itself when missing everywhere', () => {
    const translator = createTranslator(dicts, 'en');
    expect(translator.t('missing.key')).toBe('missing.key');
    expect(translator.t('missing.key', { name: 'test' })).toBe('missing.key');
  });

  it('notifies subscribers on setLanguage once and respects unsubscribe', () => {
    const translator = createTranslator(dicts, 'en');
    const subscriber = vi.fn();

    const unsubscribe = translator.subscribe(subscriber);

    // Same language does not notify
    translator.setLanguage('en');
    expect(subscriber).not.toHaveBeenCalled();

    // Changing language notifies once
    translator.setLanguage('ru');
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith('ru');
    expect(translator.language).toBe('ru');

    // Unsubscribe works
    unsubscribe();
    translator.setLanguage('en');
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(translator.language).toBe('en');
  });
});
