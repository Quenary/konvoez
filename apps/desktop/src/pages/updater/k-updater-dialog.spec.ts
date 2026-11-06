// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import type {
  IUpdaterDialogAdapter,
  IUpdaterState,
  TTranslator,
} from '@konvoez/client-shell';
import { fixture } from '../fixture';
import './k-updater-dialog';
import { KUpdaterDialog, UPDATER_DIALOG_I18N_KEYS } from './k-updater-dialog';

describe('k-updater-dialog', () => {
  const createMockTranslator = (): TTranslator => ({
    language: 'en',
    t: vi.fn((key: string, params?: Record<string, string>) => {
      if (params?.version) {
        return `${key}:${params.version}`;
      }
      return key;
    }),
    setLanguage: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });

  const createMockAdapter = (
    initialState: IUpdaterState = { status: 'checking' },
    overrides?: Partial<IUpdaterDialogAdapter>,
  ): IUpdaterDialogAdapter & {
    triggerState: (state: IUpdaterState) => void;
  } => {
    let stateListener: ((state: IUpdaterState) => void) | null = null;
    return {
      getInitial: vi.fn().mockResolvedValue({
        state: initialState,
        locale: 'en',
      }),
      getState: vi.fn().mockResolvedValue(initialState),
      onState: vi.fn((cb) => {
        stateListener = cb;
        return () => {
          stateListener = null;
        };
      }),
      download: vi.fn(),
      later: vi.fn(),
      restart: vi.fn(),
      retry: vi.fn(),
      triggerState: (state: IUpdaterState) => {
        stateListener?.(state);
      },
      ...overrides,
    };
  };

  it('defines UPDATER_DIALOG_I18N_KEYS', () => {
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.updateAvailable');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.checking');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.upToDate');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.downloadAndUpdate');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.remindLater');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.downloading');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.downloadingHint');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.readyDeferred');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.ready');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.restartNow');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.later');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.close');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.retry');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.checkFailed');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.downloadFailed');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.disabled');
    expect(UPDATER_DIALOG_I18N_KEYS).toContain('updater.version');
  });

  it('renders checking state with indeterminate progress bar and close button', async () => {
    const adapter = createMockAdapter({ status: 'checking' });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const progressBar = el.shadowRoot?.querySelector('k-progress-bar');
    expect(progressBar).toBeTruthy();
    expect(progressBar?.hasAttribute('indeterminate')).toBe(true);

    const button = el.shadowRoot?.querySelector('k-button');
    expect(button?.textContent?.trim()).toBe('updater.close');
    button?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));

    expect(adapter.later).toHaveBeenCalledTimes(1);
  });

  it('renders up-to-date state with message and close button', async () => {
    const adapter = createMockAdapter({ status: 'up-to-date' });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('updater.upToDate');
    const button = el.shadowRoot?.querySelector('k-button');
    button?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));

    expect(adapter.later).toHaveBeenCalledTimes(1);
  });

  it('renders available state with version, remind later and download buttons', async () => {
    const adapter = createMockAdapter({
      status: 'available',
      version: '1.2.3',
    });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('updater.version:1.2.3');

    const buttons = el.shadowRoot?.querySelectorAll('k-button');
    expect(buttons?.length).toBe(2);

    buttons?.[0]?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.later).toHaveBeenCalledTimes(1);

    buttons?.[1]?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.download).toHaveBeenCalledTimes(1);
  });

  it('renders downloading state with determinate progress and size details', async () => {
    const adapter = createMockAdapter({
      status: 'downloading',
      progress: {
        percent: 42,
        bytesPerSecond: 1024 * 1024 * 2,
        transferred: 1024 * 1024 * 21,
        total: 1024 * 1024 * 50,
      },
    });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const progressBar = el.shadowRoot?.querySelector('k-progress-bar');
    expect(progressBar?.getAttribute('value')).toBe('42');
    expect(el.shadowRoot?.textContent).toContain('21.0 / 50.0 MB • 2.0 MB/s');
    expect(el.shadowRoot?.textContent).toContain('updater.downloadingHint');

    const button = el.shadowRoot?.querySelector('k-button');
    button?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.later).toHaveBeenCalledTimes(1);
  });

  it('renders ready-deferred state with voice deferral notice and restart button', async () => {
    const adapter = createMockAdapter({
      status: 'ready-deferred',
      version: '2.0.0',
    });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('updater.readyDeferred');

    const buttons = el.shadowRoot?.querySelectorAll('k-button');
    expect(buttons?.length).toBe(2);

    buttons?.[1]?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.restart).toHaveBeenCalledTimes(1);
  });

  it('renders ready state with restart button', async () => {
    const adapter = createMockAdapter({
      status: 'ready',
      version: '2.0.0',
    });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('updater.ready');

    const buttons = el.shadowRoot?.querySelectorAll('k-button');
    expect(buttons?.length).toBe(2);

    buttons?.[1]?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.restart).toHaveBeenCalledTimes(1);
  });

  it('renders error state with retry and close buttons', async () => {
    const adapter = createMockAdapter({
      status: 'error',
      error: 'updater.downloadFailed',
    });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const message = el.shadowRoot?.querySelector('k-message');
    expect((message as unknown as { text: string })?.text).toBe(
      'updater.downloadFailed',
    );
    expect(message?.shadowRoot?.textContent).toContain(
      'updater.downloadFailed',
    );

    const buttons = el.shadowRoot?.querySelectorAll('k-button');
    expect(buttons?.length).toBe(2);

    buttons?.[0]?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.later).toHaveBeenCalledTimes(1);

    buttons?.[1]?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.retry).toHaveBeenCalledTimes(1);
  });

  it('renders disabled state in dev / non-AppImage environment', async () => {
    const adapter = createMockAdapter({ status: 'disabled' });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('updater.disabled');

    const button = el.shadowRoot?.querySelector('k-button');
    button?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.later).toHaveBeenCalledTimes(1);
  });

  it('reacts to onState broadcasts from adapter', async () => {
    const adapter = createMockAdapter({ status: 'checking' });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.updaterState.status).toBe('checking');

    adapter.triggerState({ status: 'available', version: '3.0.0' });
    await el.updateComplete;

    expect(el.updaterState.status).toBe('available');
    expect(el.shadowRoot?.textContent).toContain('updater.version:3.0.0');
  });

  it('renders available state fallback text when version is absent', async () => {
    const adapter = createMockAdapter({
      status: 'available',
      version: undefined,
    });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('p')?.textContent?.trim()).toBe(
      'updater.updateAvailable',
    );
  });

  it('formats speed in KB/s when below 1 MB/s', async () => {
    const adapter = createMockAdapter({
      status: 'downloading',
      progress: {
        percent: 10,
        bytesPerSecond: 1024 * 512,
        transferred: 1024 * 1024,
        total: 1024 * 1024 * 10,
      },
    });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('512 KB/s');
  });

  it('re-subscribes to onState upon reconnection to DOM', async () => {
    const adapter = createMockAdapter({ status: 'checking' });
    const translator = createMockTranslator();

    const el = await fixture<KUpdaterDialog>(html`
      <k-updater-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-updater-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(adapter.onState).toHaveBeenCalledTimes(1);

    const parent = el.parentElement;
    parent?.removeChild(el);
    await new Promise((r) => setTimeout(r, 10));

    parent?.appendChild(el);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(adapter.onState).toHaveBeenCalledTimes(2);
  });
});
