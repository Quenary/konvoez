import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildActionItems } from './app-actions';
import { buildAppMenuTemplate } from './app-menu';

const defaultHotkeys = { toggleMic: null, toggleSpeaker: null };

function submenuItems(
  template: MenuItemConstructorOptions[],
  topLabel: string,
): MenuItemConstructorOptions[] {
  const top = template.find((item) => item.label === topLabel);
  return (top?.submenu ?? []) as MenuItemConstructorOptions[];
}

function buildMenus(locale: string) {
  const run = vi.fn();
  const itemOpts = {
    state: { inVoice: true, micMuted: true, speakerMuted: false },
    isPwaLoaded: true,
    locale,
    run,
    withAccelerators: false,
    hotkeys: defaultHotkeys,
  };
  const items = buildActionItems(itemOpts);
  const template = buildAppMenuTemplate(items, locale, {
    onCloseWindow: vi.fn(),
    appVersion: '1.2.3',
  });
  return { template, run, items };
}

describe('buildAppMenuTemplate', () => {
  it('uses English top-level menu labels', () => {
    const { template } = buildMenus('en');
    expect(template.map((item) => item.label)).toEqual([
      'File',
      'Edit',
      'Voice',
      'View',
      'Window',
      'Help',
    ]);
  });

  it('uses Russian top-level menu labels', () => {
    const { template } = buildMenus('ru');
    expect(template.map((item) => item.label)).toEqual([
      'Файл',
      'Правка',
      'Голос',
      'Вид',
      'Окно',
      'Помощь',
    ]);
  });

  it('shows the app version in the Help submenu', () => {
    const { template } = buildMenus('en');
    const helpItems = submenuItems(template, 'Help');
    const appVersion = helpItems.find(
      (item) => item.label === 'App version 1.2.3',
    );

    expect(appVersion).toBeDefined();
    expect(appVersion?.enabled).toBe(false);
  });

  it('localizes the app version item in the Help submenu', () => {
    const { template } = buildMenus('ru');
    const helpItems = submenuItems(template, 'Помощь');

    expect(helpItems[0]?.label).toBe('Версия приложения 1.2.3');
  });

  it('reflects mic/speaker checkbox state in Voice menu', () => {
    const { template } = buildMenus('en');
    const voiceItems = submenuItems(template, 'Voice');
    const mic = voiceItems.find((item) => item.label === 'Mute microphone');
    const speaker = voiceItems.find((item) => item.label === 'Deafen');

    expect(mic?.type).toBe('checkbox');
    expect(mic?.checked).toBe(true);
    expect(mic?.enabled).toBe(true);
    expect(speaker?.type).toBe('checkbox');
    expect(speaker?.checked).toBe(false);
    expect(speaker?.enabled).toBe(true);
  });

  it('includes copy and paste roles in Edit menu', () => {
    const { template } = buildMenus('en');
    const editItems = submenuItems(template, 'Edit');
    expect(editItems.some((item) => item.role === 'copy')).toBe(true);
    expect(editItems.some((item) => item.role === 'paste')).toBe(true);
  });

  it('includes toggleDevTools in View menu', () => {
    const { template } = buildMenus('en');
    const viewItems = submenuItems(template, 'View');

    expect(viewItems.some((item) => item.role === 'toggleDevTools')).toBe(true);
  });

  it('quit has no role and invokes run', () => {
    const { template, run } = buildMenus('en');
    const fileItems = submenuItems(template, 'File');
    const quit = fileItems.find((item) => item.label === 'Quit');
    expect(quit?.role).toBeUndefined();
    quit?.click?.(
      {} as Electron.MenuItem,
      {} as Electron.BrowserWindow,
      {} as Electron.KeyboardEvent,
    );
    expect(run).toHaveBeenCalledWith('quit');
  });
});
