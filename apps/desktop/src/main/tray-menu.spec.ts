import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildActionItems } from './app-actions';
import { buildAppMenuTemplate } from './app-menu';
import { buildTrayMenuTemplate } from './tray';

const defaultHotkeys = { toggleMic: null, toggleSpeaker: null };

function sharedMenuOpts(locale: string, isPwaLoaded: boolean) {
  const run = vi.fn();
  return {
    opts: {
      state: { inVoice: true, micMuted: true, speakerMuted: false },
      isPwaLoaded,
      locale,
      run,
      withAccelerators: false,
      hotkeys: defaultHotkeys,
    },
    run,
  };
}

describe('buildTrayMenuTemplate', () => {
  it('builds menu items with correct checked and enabled states for active PWA', () => {
    const { opts, run } = sharedMenuOpts('en', true);
    const template = buildTrayMenuTemplate(opts);

    const micItem = template.find((item) => item.label === 'Mute microphone');
    expect(micItem).toBeDefined();
    expect(micItem?.type).toBe('checkbox');
    expect(micItem?.checked).toBe(true);
    expect(micItem?.enabled).toBe(true);

    const deafenItem = template.find((item) => item.label === 'Deafen');
    expect(deafenItem).toBeDefined();
    expect(deafenItem?.type).toBe('checkbox');
    expect(deafenItem?.checked).toBe(false);
    expect(deafenItem?.enabled).toBe(true);

    micItem?.click?.(
      {} as unknown as Electron.MenuItem,
      {} as unknown as Electron.BrowserWindow,
      {} as unknown as Electron.KeyboardEvent,
    );
    expect(run).toHaveBeenCalledWith('toggle-mic');
  });

  it('disables mute/deafen items when PWA is not loaded', () => {
    const { opts } = sharedMenuOpts('en', false);
    const template = buildTrayMenuTemplate(opts);

    const micItem = template.find((item) => item.label === 'Mute microphone');
    expect(micItem?.enabled).toBe(false);

    const deafenItem = template.find((item) => item.label === 'Deafen');
    expect(deafenItem?.enabled).toBe(false);
  });

  it('uses Russian labels when locale is ru', () => {
    const { opts } = sharedMenuOpts('ru', true);
    const template = buildTrayMenuTemplate(opts);

    expect(template.some((item) => item.label === 'Открыть Konvoez')).toBe(
      true,
    );
    expect(template.some((item) => item.label === 'Отключить микрофон')).toBe(
      true,
    );
    expect(template.some((item) => item.label === 'Выход')).toBe(true);
  });

  it('matches Voice menu checkboxes in the application menu', () => {
    const { opts } = sharedMenuOpts('en', true);
    const trayTemplate = buildTrayMenuTemplate(opts);
    const items = buildActionItems(opts);
    const appTemplate = buildAppMenuTemplate(items, 'en', {
      isPackaged: true,
      onCloseWindow: vi.fn(),
    });

    const voiceTop = appTemplate.find((item) => item.label === 'Voice');
    const voiceItems = (voiceTop?.submenu ??
      []) as MenuItemConstructorOptions[];

    const trayMic = trayTemplate.find(
      (item) => item.label === 'Mute microphone',
    );
    const appMic = voiceItems.find((item) => item.label === 'Mute microphone');
    expect(appMic?.label).toBe(trayMic?.label);
    expect(appMic?.checked).toBe(trayMic?.checked);
    expect(appMic?.enabled).toBe(trayMic?.enabled);

    const traySpeaker = trayTemplate.find((item) => item.label === 'Deafen');
    const appSpeaker = voiceItems.find((item) => item.label === 'Deafen');
    expect(appSpeaker?.label).toBe(traySpeaker?.label);
    expect(appSpeaker?.checked).toBe(traySpeaker?.checked);
    expect(appSpeaker?.enabled).toBe(traySpeaker?.enabled);
  });
});
