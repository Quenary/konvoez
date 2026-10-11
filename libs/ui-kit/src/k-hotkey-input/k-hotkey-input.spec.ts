import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-hotkey-input';
import type { KHotkeyInput } from './k-hotkey-input';

describe('k-hotkey-input', () => {
  it('focus emits k-recording-start', async () => {
    const el = await fixture<KHotkeyInput>(html`
      <k-hotkey-input label="Toggle mute"></k-hotkey-input>
    `);

    const onStart = vi.fn();
    el.addEventListener('k-recording-start', onStart);

    el.dispatchEvent(new Event('focus'));
    await el.updateComplete;

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(el.recording).toBe(true);
  });

  it('keydown with shortcut sets value, emits k-change and k-recording-stop {cancelled:false}', async () => {
    const el = await fixture<KHotkeyInput>(html`
      <k-hotkey-input value="CommandOrControl+D"></k-hotkey-input>
    `);

    const onChange = vi.fn();
    const onStop = vi.fn();
    el.addEventListener('k-change', onChange);
    el.addEventListener('k-recording-stop', onStop);

    el.dispatchEvent(new Event('focus'));
    await el.updateComplete;

    const event = new KeyboardEvent('keydown', {
      code: 'KeyM',
      ctrlKey: true,
      shiftKey: true,
      key: 'Ь',
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    await el.updateComplete;

    expect(event.defaultPrevented).toBe(true);
    expect(el.value).toBe('CommandOrControl+Shift+M');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { value: 'CommandOrControl+Shift+M' },
      }),
    );
    expect(onStop).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { cancelled: false },
      }),
    );
    expect(el.recording).toBe(false);
  });

  it('Escape restores previous value with cancelled:true', async () => {
    const el = await fixture<KHotkeyInput>(html`
      <k-hotkey-input value="CommandOrControl+D"></k-hotkey-input>
    `);

    const onStop = vi.fn();
    const onChange = vi.fn();
    el.addEventListener('k-recording-stop', onStop);
    el.addEventListener('k-change', onChange);

    el.dispatchEvent(new Event('focus'));
    await el.updateComplete;

    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(escEvent);
    await el.updateComplete;

    expect(escEvent.defaultPrevented).toBe(true);
    expect(el.value).toBe('CommandOrControl+D');
    expect(onChange).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { cancelled: true },
      }),
    );
    expect(el.recording).toBe(false);
  });

  it('Backspace sets value to null and emits k-change and k-recording-stop', async () => {
    const el = await fixture<KHotkeyInput>(html`
      <k-hotkey-input value="CommandOrControl+D"></k-hotkey-input>
    `);

    const onStop = vi.fn();
    const onChange = vi.fn();
    el.addEventListener('k-recording-stop', onStop);
    el.addEventListener('k-change', onChange);

    el.dispatchEvent(new Event('focus'));
    await el.updateComplete;

    const bsEvent = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(bsEvent);
    await el.updateComplete;

    expect(bsEvent.defaultPrevented).toBe(true);
    expect(el.value).toBeNull();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { value: null },
      }),
    );
    expect(onStop).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { cancelled: false },
      }),
    );
    expect(el.recording).toBe(false);
  });

  it('modifier-only key keeps recording', async () => {
    const el = await fixture<KHotkeyInput>(html`
      <k-hotkey-input value="CommandOrControl+D"></k-hotkey-input>
    `);

    const onStop = vi.fn();
    el.addEventListener('k-recording-stop', onStop);

    el.dispatchEvent(new Event('focus'));
    await el.updateComplete;

    const ctrlEvent = new KeyboardEvent('keydown', {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(ctrlEvent);
    await el.updateComplete;

    expect(ctrlEvent.defaultPrevented).toBe(true);
    expect(el.recording).toBe(true);
    expect(onStop).not.toHaveBeenCalled();
  });

  it('outside recording, keydown is not preventDefaulted', async () => {
    const el = await fixture<KHotkeyInput>(html`
      <k-hotkey-input value="CommandOrControl+D"></k-hotkey-input>
    `);

    const keyEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(false);
  });
});
