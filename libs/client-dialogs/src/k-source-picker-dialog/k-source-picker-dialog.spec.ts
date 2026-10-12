import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import type {
  ISourcePickerDialogAdapter,
  ISerializableSource,
  TTranslator,
} from '@konvoez/client-shell';
import { fixture } from '../testing/fixture';
import './k-source-picker-dialog';
import {
  KSourcePickerDialog,
  PICKER_DIALOG_I18N_KEYS,
} from './k-source-picker-dialog';

describe('k-source-picker-dialog', () => {
  const mockSources: ISerializableSource[] = [
    {
      id: 'screen:0:0',
      name: 'Entire Screen',
      thumbnailUrl: 'data:image/png;base64,111',
      appIconUrl: null,
    },
    {
      id: 'window:42',
      name: 'Terminal',
      thumbnailUrl: 'data:image/png;base64,222',
      appIconUrl: null,
    },
  ];

  const createMockTranslator = (): TTranslator => ({
    language: 'en',
    t: vi.fn((key: string) => key),
    setLanguage: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });

  const createMockAdapter = (
    overrides?: Partial<ISourcePickerDialogAdapter>,
  ): ISourcePickerDialogAdapter => ({
    getInitial: vi.fn().mockResolvedValue({
      sources: mockSources,
      shareAudio: true,
      audioSupported: true,
      locale: 'en',
    }),
    setShareAudio: vi.fn(),
    pick: vi.fn(),
    ...overrides,
  });

  it('defines PICKER_DIALOG_I18N_KEYS', () => {
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.title');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.screens');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.windows');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.cancel');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.share');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.noScreens');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.noWindows');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.shareAudio');
    expect(PICKER_DIALOG_I18N_KEYS).toContain('picker.shareAudioHint');
  });

  it('screens tab filters out window: ids and preselects first item', async () => {
    const adapter = createMockAdapter();
    const translator = createMockTranslator();

    const el = await fixture<KSourcePickerDialog>(html`
      <k-source-picker-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-source-picker-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(el.activeTab).toBe('screens');
    expect(el.currentSources).toHaveLength(1);
    expect(el.currentSources[0].id).toBe('screen:0:0');
    expect(el.selectedId).toBe('screen:0:0');
  });

  it('uses provided initial state without requesting it from the adapter', async () => {
    const adapter = createMockAdapter();
    const translator = createMockTranslator();
    const initial = {
      sources: mockSources,
      shareAudio: false,
      audioSupported: true,
      locale: 'en' as const,
    };

    const el = await fixture<KSourcePickerDialog>(html`
      <k-source-picker-dialog
        .adapter="${adapter}"
        .translator="${translator}"
        .initial="${initial}"></k-source-picker-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    expect(adapter.getInitial).not.toHaveBeenCalled();
    expect(el.currentSources).toHaveLength(1);
    expect(el.selectedId).toBe('screen:0:0');
    expect(el.shareAudio).toBe(false);
  });

  it('windows tab shows empty text when there are none', async () => {
    const adapter = createMockAdapter({
      getInitial: vi.fn().mockResolvedValue({
        sources: [
          {
            id: 'screen:0',
            name: 'Screen',
            thumbnailUrl: '',
            appIconUrl: null,
          },
        ],
        shareAudio: true,
        audioSupported: true,
        locale: 'en',
      }),
    });
    const translator = createMockTranslator();

    const el = await fixture<KSourcePickerDialog>(html`
      <k-source-picker-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-source-picker-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    el.activeTab = 'windows';
    await el.updateComplete;

    const grid = el.shadowRoot?.querySelector('k-source-grid');
    const emptySlot = grid?.querySelector('[slot="empty"]');
    expect(emptySlot?.textContent).toBe('picker.noWindows');
  });

  it('toggling audio calls setShareAudio(false)', async () => {
    const adapter = createMockAdapter();
    const translator = createMockTranslator();

    const el = await fixture<KSourcePickerDialog>(html`
      <k-source-picker-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-source-picker-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const checkbox = el.shadowRoot?.querySelector('k-checkbox');
    checkbox?.dispatchEvent(
      new CustomEvent('k-change', {
        bubbles: true,
        detail: { checked: false },
      }),
    );
    await el.updateComplete;

    expect(adapter.setShareAudio).toHaveBeenCalledWith(false);
    expect(el.shareAudio).toBe(false);
  });

  it('Share calls pick(id, withAudio), Cancel and Escape call pick(null, withAudio)', async () => {
    const adapter = createMockAdapter();
    const translator = createMockTranslator();

    const el = await fixture<KSourcePickerDialog>(html`
      <k-source-picker-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-source-picker-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const buttons = el.shadowRoot?.querySelectorAll('k-button');
    const cancelBtn = buttons?.[0];
    const shareBtn = buttons?.[1];

    const onPicked = vi.fn();
    const onCancelled = vi.fn();
    el.addEventListener('k-picked', onPicked);
    el.addEventListener('k-cancelled', onCancelled);

    shareBtn?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.pick).toHaveBeenCalledWith('screen:0:0', true);
    expect(onPicked).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { sourceId: 'screen:0:0', withAudio: true },
      }),
    );

    cancelBtn?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    expect(adapter.pick).toHaveBeenCalledWith(null, true);
    expect(onCancelled).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(adapter.pick).toHaveBeenCalledWith(null, true);
    expect(onCancelled).toHaveBeenCalledTimes(2);
  });

  it('audioSupported:false hides checkbox and shows hint', async () => {
    const adapter = createMockAdapter({
      getInitial: vi.fn().mockResolvedValue({
        sources: mockSources,
        shareAudio: false,
        audioSupported: false,
        locale: 'en',
      }),
    });
    const translator = createMockTranslator();

    const el = await fixture<KSourcePickerDialog>(html`
      <k-source-picker-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-source-picker-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const checkbox = el.shadowRoot?.querySelector('k-checkbox');
    expect(checkbox).toBeNull();

    const hint = el.shadowRoot?.querySelector('p.audio-hint');
    expect(hint?.textContent).toBe('picker.shareAudioHint');
  });
});
