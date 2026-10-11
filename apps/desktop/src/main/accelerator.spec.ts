import { describe, expect, it, vi } from 'vitest';
import { formatKeyboardEventToAccelerator } from './hotkeys';

describe('formatKeyboardEventToAccelerator', () => {
  it('formats modifier + physical key combinations', () => {
    expect(
      formatKeyboardEventToAccelerator({
        code: 'KeyM',
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBe('CommandOrControl+Shift+M');
  });

  it('uses physical code on Cyrillic layouts', () => {
    expect(
      formatKeyboardEventToAccelerator({
        code: 'KeyM',
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBe('CommandOrControl+Shift+M');
  });

  it('maps digit keys by code', () => {
    expect(
      formatKeyboardEventToAccelerator({
        code: 'Digit1',
        altKey: true,
      }),
    ).toBe('Alt+1');
  });

  it('allows function keys without modifiers', () => {
    expect(formatKeyboardEventToAccelerator({ code: 'F9' })).toBe('F9');
  });

  it('allows bare letter and punctuation keys', () => {
    expect(formatKeyboardEventToAccelerator({ code: 'KeyM' })).toBe('M');
    expect(formatKeyboardEventToAccelerator({ code: 'KeyZ' })).toBe('Z');
    expect(formatKeyboardEventToAccelerator({ code: 'BracketLeft' })).toBe('[');
  });

  it('rejects modifier-only key events', () => {
    expect(
      formatKeyboardEventToAccelerator({
        code: 'ShiftLeft',
        shiftKey: true,
      }),
    ).toBe(null);
  });

  it('maps numpad digits', () => {
    expect(
      formatKeyboardEventToAccelerator({
        code: 'Numpad5',
        ctrlKey: true,
      }),
    ).toBe('CommandOrControl+num5');
  });

  it('allows media keys without modifiers', () => {
    expect(formatKeyboardEventToAccelerator({ code: 'MediaPlayPause' })).toBe(
      'MediaPlayPause',
    );
  });

  it('does not access Node process globals', () => {
    vi.stubGlobal('process', undefined);
    try {
      expect(
        formatKeyboardEventToAccelerator({
          code: 'KeyM',
          ctrlKey: true,
        }),
      ).toBe('CommandOrControl+M');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
