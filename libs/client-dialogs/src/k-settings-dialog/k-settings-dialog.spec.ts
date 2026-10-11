import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import type {
  ISettingsDialogAdapter,
  TTranslator,
} from '@konvoez/client-shell';
import { fixture } from '../testing/fixture';
import './k-settings-dialog';
import {
  KSettingsDialog,
  SETTINGS_DIALOG_I18N_KEYS,
} from './k-settings-dialog';

describe('k-settings-dialog', () => {
  const createMockTranslator = (): TTranslator => ({
    language: 'en',
    t: vi.fn((key: string) => key),
    setLanguage: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });

  const createMockAdapter = (
    overrides?: Partial<ISettingsDialogAdapter>,
  ): ISettingsDialogAdapter => ({
    getInitial: vi.fn().mockResolvedValue({
      hotkeys: {
        toggleMic: 'CommandOrControl+Shift+M',
        toggleSpeaker: 'CommandOrControl+Shift+D',
      },
      autostart: true,
      locale: 'en',
    }),
    save: vi.fn().mockResolvedValue({
      hotkeys: {
        toggleMic: 'ok',
        toggleSpeaker: 'ok',
      },
    }),
    suspendHotkeys: vi.fn(),
    resumeHotkeys: vi.fn(),
    ...overrides,
  });

  it('defines SETTINGS_DIALOG_I18N_KEYS', () => {
    expect(SETTINGS_DIALOG_I18N_KEYS).toContain('settings.title');
    expect(SETTINGS_DIALOG_I18N_KEYS).toContain('settings.hotkeysHint');
    expect(SETTINGS_DIALOG_I18N_KEYS).toContain('settings.saved');
    expect(SETTINGS_DIALOG_I18N_KEYS).toContain('settings.saveFailed');
    expect(SETTINGS_DIALOG_I18N_KEYS).toContain('hotkeys.conflict');
  });

  it('renders hint paragraph with settings.hotkeysHint text', async () => {
    const adapter = createMockAdapter();
    const translator = createMockTranslator();

    const el = await fixture<KSettingsDialog>(html`
      <k-settings-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-settings-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const hint = el.shadowRoot?.querySelector('p.hint-paragraph');
    expect(hint?.textContent).toBe('settings.hotkeysHint');
  });

  it('start/stop recording calls suspendHotkeys/resumeHotkeys balanced', async () => {
    const adapter = createMockAdapter();
    const translator = createMockTranslator();

    const el = await fixture<KSettingsDialog>(html`
      <k-settings-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-settings-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const micInput = el.shadowRoot?.querySelector('k-hotkey-input');
    micInput?.dispatchEvent(
      new CustomEvent('k-recording-start', { bubbles: true }),
    );
    expect(adapter.suspendHotkeys).toHaveBeenCalledTimes(1);

    micInput?.dispatchEvent(
      new CustomEvent('k-recording-stop', { bubbles: true }),
    );
    expect(adapter.resumeHotkeys).toHaveBeenCalledTimes(1);
  });

  it('save sends edited hotkeys and autostart', async () => {
    const adapter = createMockAdapter({
      save: vi.fn().mockResolvedValue({
        hotkeys: {
          toggleMic: 'ok',
          toggleSpeaker: 'ok',
        },
      }),
    });
    const translator = createMockTranslator();

    const el = await fixture<KSettingsDialog>(html`
      <k-settings-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-settings-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    el.micKey = 'F12';
    el.autostart = false;
    await el.updateComplete;

    const onSaved = vi.fn();
    el.addEventListener('k-saved', onSaved);

    const saveBtn = el.shadowRoot?.querySelector('k-button');
    saveBtn?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    await el.updateComplete;

    expect(adapter.save).toHaveBeenCalledWith({
      hotkeys: {
        toggleMic: 'F12',
        toggleSpeaker: 'CommandOrControl+Shift+D',
      },
      autostart: false,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(el.saveMessage?.variant).toBe('success');
  });

  it('conflict status renders hotkeys.conflict on that input', async () => {
    const adapter = createMockAdapter({
      save: vi.fn().mockResolvedValue({
        hotkeys: {
          toggleMic: 'conflict',
          toggleSpeaker: 'ok',
        },
      }),
    });
    const translator = createMockTranslator();

    const el = await fixture<KSettingsDialog>(html`
      <k-settings-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-settings-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const saveBtn = el.shadowRoot?.querySelector('k-button');
    saveBtn?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    await el.updateComplete;

    expect(el.micError).toBe('hotkeys.conflict');
    expect(el.speakerHint).toBe('hotkeys.ok');
  });

  it('save rejection shows settings.saveFailed', async () => {
    const adapter = createMockAdapter({
      save: vi.fn().mockRejectedValue(new Error('FAIL')),
    });
    const translator = createMockTranslator();

    const el = await fixture<KSettingsDialog>(html`
      <k-settings-dialog
        .adapter="${adapter}"
        .translator="${translator}"></k-settings-dialog>
    `);
    await new Promise((r) => setTimeout(r, 10));
    await el.updateComplete;

    const saveBtn = el.shadowRoot?.querySelector('k-button');
    saveBtn?.dispatchEvent(new CustomEvent('k-click', { bubbles: true }));
    await el.updateComplete;

    expect(el.saveMessage?.variant).toBe('error');
    expect(el.saveMessage?.text).toBe('settings.saveFailed');
  });
});
