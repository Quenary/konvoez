import type { TLanguage, TTranslator } from '@konvoez/client-shell';
import { desktopTranslator } from '../i18n/dictionary';

export async function mountDialog<
  T extends HTMLElement & {
    adapter: { getInitial(): Promise<{ locale: TLanguage }> } | null;
    translator: TTranslator | null;
    initial: object | null;
  },
  TInitial extends NonNullable<T['initial']> = NonNullable<T['initial']>,
>(
  selector: string,
  adapter: NonNullable<T['adapter']> & {
    getInitial(): Promise<TInitial>;
  },
): Promise<T> {
  const el = document.querySelector<T>(selector);
  if (!el) {
    throw new Error(`Element matching selector "${selector}" not found`);
  }
  const initial = await adapter.getInitial();
  desktopTranslator.setLanguage(initial.locale);
  el.translator = desktopTranslator;
  el.initial = initial;
  el.adapter = adapter;
  return el;
}
