import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenuTemplate } from './tray';

describe('buildTrayMenuTemplate', () => {
  it('builds menu items with correct checked and enabled states for active PWA', () => {
    const onAction = vi.fn();
    const template = buildTrayMenuTemplate({
      state: { inVoice: true, micMuted: true, speakerMuted: false },
      isPwaLoaded: true,
      locale: 'en',
      onAction,
    });

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
    expect(onAction).toHaveBeenCalledWith('toggle-mic');
  });

  it('disables mute/deafen items when PWA is not loaded', () => {
    const onAction = vi.fn();
    const template = buildTrayMenuTemplate({
      state: { inVoice: false, micMuted: false, speakerMuted: false },
      isPwaLoaded: false,
      locale: 'en',
      onAction,
    });

    const micItem = template.find((item) => item.label === 'Mute microphone');
    expect(micItem?.enabled).toBe(false);

    const deafenItem = template.find((item) => item.label === 'Deafen');
    expect(deafenItem?.enabled).toBe(false);
  });

  it('uses Russian labels when locale is ru', () => {
    const onAction = vi.fn();
    const template = buildTrayMenuTemplate({
      state: { inVoice: false, micMuted: false, speakerMuted: false },
      isPwaLoaded: true,
      locale: 'ru',
      onAction,
    });

    expect(template.some((item) => item.label === 'Открыть Konvoez')).toBe(
      true,
    );
    expect(template.some((item) => item.label === 'Отключить микрофон')).toBe(
      true,
    );
    expect(template.some((item) => item.label === 'Выход')).toBe(true);
  });
});
