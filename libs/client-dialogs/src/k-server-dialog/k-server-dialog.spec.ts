import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import type { IServerDialogAdapter, TTranslator } from '@konvoez/client-shell';
import { fixture } from '../testing/fixture';
import './k-server-dialog';
import { KServerDialog, SERVER_DIALOG_I18N_KEYS } from './k-server-dialog';

describe('k-server-dialog', () => {
  const createMockTranslator = (): TTranslator => ({
    language: 'en',
    languages: ['en', 'ru'],
    t: vi.fn((key: string) => key),
    setLanguage: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });

  const createMockAdapter = (
    overrides?: Partial<IServerDialogAdapter>,
  ): IServerDialogAdapter => ({
    getInitial: vi.fn().mockResolvedValue({
      serverOrigin: 'https://initial.konvoez.com',
      locale: 'en',
    }),
    saveServer: vi.fn().mockResolvedValue({
      origin: 'https://initial.konvoez.com',
    }),
    ...overrides,
  });

  it('defines SERVER_DIALOG_I18N_KEYS', () => {
    expect(SERVER_DIALOG_I18N_KEYS).toContain('server.title');
    expect(SERVER_DIALOG_I18N_KEYS).toContain('server.errorInsecure');
    expect(SERVER_DIALOG_I18N_KEYS).toContain('server.errorInvalid');
    expect(SERVER_DIALOG_I18N_KEYS).toContain('server.errorUnreachable');
  });

  it('loads initial origin and submits on connect button click', async () => {
    const adapter = createMockAdapter({
      saveServer: vi.fn().mockResolvedValue({ origin: 'https://saved.org' }),
    });
    const translator = createMockTranslator();

    const el = await fixture<KServerDialog>(html`
      <k-server-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-server-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.serverUrl).toBe('https://initial.konvoez.com');

    const onDone = vi.fn();
    el.addEventListener('k-done', onDone);

    const button = el.shadowRoot?.querySelector('k-button');
    button?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    await el.updateComplete;

    expect(adapter.saveServer).toHaveBeenCalledWith(
      'https://initial.konvoez.com',
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].detail).toEqual({
      origin: 'https://saved.org',
    });
  });

  it('INSECURE maps to server.errorInsecure', async () => {
    const adapter = createMockAdapter({
      saveServer: vi.fn().mockRejectedValue(new Error('INSECURE')),
    });
    const translator = createMockTranslator();

    const el = await fixture<KServerDialog>(html`
      <k-server-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-server-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const button = el.shadowRoot?.querySelector('k-button');
    button?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    await el.updateComplete;

    expect(el.error).toBe('server.errorInsecure');
  });

  it('HTTP_500 maps to server.errorUnreachable', async () => {
    const adapter = createMockAdapter({
      saveServer: vi.fn().mockRejectedValue(new Error('HTTP_500')),
    });
    const translator = createMockTranslator();

    const el = await fixture<KServerDialog>(html`
      <k-server-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-server-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const button = el.shadowRoot?.querySelector('k-button');
    button?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    await el.updateComplete;

    expect(el.error).toBe('server.errorUnreachable');
  });

  it('Enter in k-input triggers connect', async () => {
    const adapter = createMockAdapter({
      saveServer: vi.fn().mockResolvedValue({ origin: 'https://enter.org' }),
    });
    const translator = createMockTranslator();

    const el = await fixture<KServerDialog>(html`
      <k-server-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-server-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const onDone = vi.fn();
    el.addEventListener('k-done', onDone);

    const input = el.shadowRoot?.querySelector('k-input');
    input?.dispatchEvent(new CustomEvent('k-enter', { bubbles: true }));
    await el.updateComplete;

    expect(adapter.saveServer).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
