import { describe, expect, it } from 'vitest';
import { formatKeyboardEventToAccelerator } from './hotkeys';

describe('formatKeyboardEventToAccelerator', () => {
  it('returns null when only modifier keys are pressed', () => {
    expect(
      formatKeyboardEventToAccelerator({ key: 'Control', ctrlKey: true }),
    ).toBe(null);
    expect(
      formatKeyboardEventToAccelerator({ key: 'Shift', shiftKey: true }),
    ).toBe(null);
    expect(formatKeyboardEventToAccelerator({ key: 'Alt', altKey: true })).toBe(
      null,
    );
  });

  it('formats modifier + character key combinations', () => {
    expect(
      formatKeyboardEventToAccelerator({
        key: 'm',
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBe('CommandOrControl+Shift+M');

    expect(
      formatKeyboardEventToAccelerator({
        key: 'd',
        ctrlKey: true,
        altKey: true,
      }),
    ).toBe('CommandOrControl+Alt+D');
  });

  it('formats space and functional keys', () => {
    expect(
      formatKeyboardEventToAccelerator({
        key: ' ',
        ctrlKey: true,
      }),
    ).toBe('CommandOrControl+Space');

    expect(
      formatKeyboardEventToAccelerator({
        key: 'F9',
      }),
    ).toBe('F9');
  });
});
