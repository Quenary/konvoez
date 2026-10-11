import type { TLanguage, TTranslator } from '@konvoez/client-shell';
import { desktopTranslator } from '../i18n/dictionary';

export async function mountDialog<
  T extends HTMLElement & { adapter: unknown; translator: TTranslator | null },
>(
  selector: string,
  adapter: T['adapter'],
  getLocale: () => Promise<TLanguage>,
): Promise<T> {
  const el = document.querySelector<T>(selector);
  if (!el) {
    throw new Error(`Element matching selector "${selector}" not found`);
  }
  desktopTranslator.setLanguage(await getLocale());
  el.translator = desktopTranslator;
  el.adapter = adapter;
  return el;
}
