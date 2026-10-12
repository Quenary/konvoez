import { describe, expect, it } from 'vitest';
import type { ReactiveControllerHost } from 'lit';
import type { TLanguage, TTranslator } from '@konvoez/client-shell';
import { I18nController } from './i18n-controller';

describe('I18nController', () => {
  function createFakeHost(): ReactiveControllerHost & {
    controllers: unknown[];
    updates: number;
  } {
    return {
      controllers: [],
      updates: 0,
      addController(c) {
        this.controllers.push(c);
      },
      removeController(c) {
        this.controllers = this.controllers.filter((x) => x !== c);
      },
      requestUpdate() {
        this.updates++;
      },
      updateComplete: Promise.resolve(true),
    };
  }

  function createFakeTranslator(initial: TLanguage = 'en'): TTranslator & {
    subscribers: Array<(lang: TLanguage) => void>;
  } {
    let lang = initial;
    const subscribers: Array<(lang: TLanguage) => void> = [];
    return {
      get language() {
        return lang;
      },
      subscribers,
      setLanguage(newLang: TLanguage) {
        lang = newLang;
        for (const fn of subscribers) {
          fn(newLang);
        }
      },
      subscribe(fn: (lang: TLanguage) => void) {
        subscribers.push(fn);
        return () => {
          const index = subscribers.indexOf(fn);
          if (index > -1) {
            subscribers.splice(index, 1);
          }
        };
      },
      t(key: string, vars?: Record<string, string>) {
        return `[${lang}] ${key}${vars ? ' ' + JSON.stringify(vars) : ''}`;
      },
    };
  }

  it('registers on host and translates keys', () => {
    const host = createFakeHost();
    const translator = createFakeTranslator('en');
    const controller = new I18nController(host, translator);

    expect(host.controllers).toContain(controller);
    expect(controller.t('server.title')).toBe('[en] server.title');
  });

  it('subscribes on hostConnected and requests update on language change', () => {
    const host = createFakeHost();
    const translator = createFakeTranslator('en');
    const controller = new I18nController(host, translator);

    controller.hostConnected();
    expect(translator.subscribers.length).toBe(1);

    translator.setLanguage('ru');
    expect(host.updates).toBe(1);
    expect(controller.t('server.title')).toBe('[ru] server.title');

    controller.hostDisconnected();
    expect(translator.subscribers.length).toBe(0);

    translator.setLanguage('en');
    expect(host.updates).toBe(1); // not updated when disconnected
  });

  it('updates subscription when setTranslator is called', () => {
    const host = createFakeHost();
    const translator1 = createFakeTranslator('en');
    const translator2 = createFakeTranslator('ru');
    const controller = new I18nController(host, translator1);

    controller.hostConnected();
    expect(translator1.subscribers.length).toBe(1);

    controller.setTranslator(translator2);
    expect(translator1.subscribers.length).toBe(0);
    expect(translator2.subscribers.length).toBe(1);
    expect(controller.t('test')).toBe('[ru] test');
  });
});
