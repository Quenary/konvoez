// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountDialog } from './mount';
import { desktopTranslator } from '../i18n/dictionary';

describe('mountDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sets translator language and assigns adapter to matched element', async () => {
    const el = document.createElement('div') as unknown as HTMLElement & {
      adapter: unknown;
      translator: typeof desktopTranslator;
    };
    el.id = 'test-dialog';
    document.body.appendChild(el);

    const mockAdapter = { foo: 'bar' };
    const getLocale = vi.fn().mockResolvedValue('ru');

    const mounted = await mountDialog('#test-dialog', mockAdapter, getLocale);

    expect(mounted).toBe(el);
    expect(mounted.adapter).toBe(mockAdapter);
    expect(mounted.translator).toBe(desktopTranslator);
    expect(desktopTranslator.language).toBe('ru');
    expect(getLocale).toHaveBeenCalledTimes(1);
  });

  it('throws error if selector does not match any element', async () => {
    const mockAdapter = {};
    const getLocale = vi.fn().mockResolvedValue('en');

    await expect(
      mountDialog('#non-existent', mockAdapter, getLocale),
    ).rejects.toThrow('Element matching selector "#non-existent" not found');
  });
});
