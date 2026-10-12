// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountDialog } from './mount';
import { desktopTranslator } from '../i18n/dictionary';

describe('mountDialog', () => {
  type TInitial = { locale: 'en' | 'ru'; value: string };
  type TAdapter = { getInitial: () => Promise<TInitial> };
  type TTestDialog = HTMLElement & {
    adapter: TAdapter;
    translator: typeof desktopTranslator | null;
    initial: TInitial;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('loads initial state once and assigns it with translator and adapter', async () => {
    const el = document.createElement('div') as unknown as TTestDialog;
    el.id = 'test-dialog';
    document.body.appendChild(el);

    const initial: TInitial = { locale: 'ru', value: 'test' };
    const mockAdapter: TAdapter = {
      getInitial: vi.fn().mockResolvedValue(initial),
    };

    const mounted = await mountDialog<TTestDialog>('#test-dialog', mockAdapter);

    expect(mounted).toBe(el);
    expect(mounted.adapter).toBe(mockAdapter);
    expect(mounted.initial).toBe(initial);
    expect(mounted.translator).toBe(desktopTranslator);
    expect(desktopTranslator.language).toBe('ru');
    expect(mockAdapter.getInitial).toHaveBeenCalledTimes(1);
  });

  it('throws error if selector does not match any element', async () => {
    const mockAdapter: TAdapter = {
      getInitial: vi.fn().mockResolvedValue({ locale: 'en', value: 'test' }),
    };

    await expect(
      mountDialog<TTestDialog>('#non-existent', mockAdapter),
    ).rejects.toThrow('Element matching selector "#non-existent" not found');
    expect(mockAdapter.getInitial).not.toHaveBeenCalled();
  });
});
