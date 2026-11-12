import { describe, expect, it } from 'vitest';
import {
  acceleratorsMatch,
  formatKeyboardEventToAccelerator,
  isElectronAccelerator,
  isSidedOrModifierOnlyAccelerator,
  normalizeAccelerator,
} from './accelerator';

describe('formatKeyboardEventToAccelerator', () => {
  it('formats one physical side plus a key', () => {
    expect(
      formatKeyboardEventToAccelerator(['ControlLeft', 'ShiftLeft', 'KeyM']),
    ).toBe('ControlLeft+ShiftLeft+M');
    expect(formatKeyboardEventToAccelerator(['ControlRight', 'KeyM'])).toBe(
      'ControlRight+M',
    );
  });

  it('uses physical code on Cyrillic layouts', () => {
    expect(formatKeyboardEventToAccelerator(['KeyM'])).toBe('M');
  });

  it('maps digit keys by code', () => {
    expect(formatKeyboardEventToAccelerator(['AltLeft', 'Digit1'])).toBe(
      'AltLeft+1',
    );
  });

  it('allows a modifier with no other key', () => {
    expect(formatKeyboardEventToAccelerator(['ControlRight'])).toBe(
      'ControlRight',
    );
    expect(formatKeyboardEventToAccelerator(['AltLeft', 'ControlLeft'])).toBe(
      'AltLeft+ControlLeft',
    );
  });

  it('allows function keys without modifiers', () => {
    expect(formatKeyboardEventToAccelerator(['F9'])).toBe('F9');
  });

  it('allows bare letter and punctuation keys', () => {
    expect(formatKeyboardEventToAccelerator(['KeyM'])).toBe('M');
    expect(formatKeyboardEventToAccelerator(['KeyZ'])).toBe('Z');
    expect(formatKeyboardEventToAccelerator(['BracketLeft'])).toBe('[');
  });

  it('rejects escape and backspace', () => {
    expect(formatKeyboardEventToAccelerator(['Escape'])).toBeNull();
    expect(formatKeyboardEventToAccelerator(['Backspace'])).toBeNull();
  });

  it('maps numpad digits', () => {
    expect(formatKeyboardEventToAccelerator(['ControlLeft', 'Numpad5'])).toBe(
      'ControlLeft+num5',
    );
  });

  it('maps lock, print, pause, menu and numpad operation keys', () => {
    expect(formatKeyboardEventToAccelerator(['CapsLock'])).toBe('Capslock');
    expect(formatKeyboardEventToAccelerator(['NumLock'])).toBe('Numlock');
    expect(formatKeyboardEventToAccelerator(['ScrollLock'])).toBe('Scrolllock');
    expect(formatKeyboardEventToAccelerator(['PrintScreen'])).toBe(
      'PrintScreen',
    );
    expect(formatKeyboardEventToAccelerator(['Pause'])).toBe('Pause');
    expect(formatKeyboardEventToAccelerator(['ContextMenu'])).toBe(
      'ContextMenu',
    );
    expect(formatKeyboardEventToAccelerator(['NumpadEnter'])).toBe(
      'NumpadEnter',
    );
    expect(formatKeyboardEventToAccelerator(['NumpadAdd'])).toBe('numadd');
    expect(formatKeyboardEventToAccelerator(['NumpadSubtract'])).toBe('numsub');
    expect(formatKeyboardEventToAccelerator(['NumpadMultiply'])).toBe(
      'nummult',
    );
    expect(formatKeyboardEventToAccelerator(['NumpadDivide'])).toBe('numdiv');
    expect(formatKeyboardEventToAccelerator(['NumpadDecimal'])).toBe('numdec');
  });

  it('allows media keys without modifiers', () => {
    expect(formatKeyboardEventToAccelerator(['MediaPlayPause'])).toBe(
      'MediaPlayPause',
    );
  });

  it('does not access Node process globals', () => {
    const source = formatKeyboardEventToAccelerator.toString();
    expect(source).not.toMatch(/\bprocess\b/);
    expect(source).not.toMatch(/\brequire\b/);
    expect(formatKeyboardEventToAccelerator(['KeyM'])).toBe('M');
  });
});

describe('normalizeAccelerator', () => {
  it('normalizes modifier synonyms and casing', () => {
    expect(normalizeAccelerator('Ctrl+Shift+M')).toBe(
      'CommandOrControl+Shift+M',
    );
    expect(normalizeAccelerator('cmdorctrl+m')).toBe('CommandOrControl+M');
    expect(normalizeAccelerator('Command+Option+f9')).toBe(
      'Alt+CommandOrControl+F9',
    );
    expect(normalizeAccelerator('Meta+Shift+Z')).toBe('Shift+Super+Z');
    expect(normalizeAccelerator(null)).toBeNull();
    expect(normalizeAccelerator('   ')).toBeNull();
  });

  it('keeps a physical side instead of collapsing it', () => {
    expect(normalizeAccelerator('controlleft')).toBe('ControlLeft');
    expect(normalizeAccelerator('AltRight+controlLeft')).toBe(
      'AltRight+ControlLeft',
    );
    expect(normalizeAccelerator('ShiftLeft')).toBe('ShiftLeft');
    expect(normalizeAccelerator('MetaRight+m')).toBe('MetaRight+M');
  });
});

describe('acceleratorsMatch', () => {
  it('matches a sided chord only on that side', () => {
    expect(acceleratorsMatch('ControlRight', 'ControlRight')).toBe(true);
    expect(acceleratorsMatch('ControlRight', 'ControlLeft')).toBe(false);
    expect(acceleratorsMatch('ControlLeft+M', 'ControlRight+M')).toBe(false);
    expect(acceleratorsMatch('ControlLeft+M', 'ControlLeft+M')).toBe(true);
  });

  it('matches an unsided legacy modifier on either side', () => {
    expect(
      acceleratorsMatch('CommandOrControl+Shift+M', 'ControlLeft+ShiftRight+M'),
    ).toBe(true);
    expect(
      acceleratorsMatch('CommandOrControl+Shift+M', 'ControlRight+ShiftLeft+M'),
    ).toBe(true);
    expect(acceleratorsMatch('Ctrl+Shift+M', 'ControlRight+ShiftLeft+M')).toBe(
      true,
    );
  });

  it('rejects an extra modifier', () => {
    expect(
      acceleratorsMatch('CommandOrControl+M', 'AltLeft+ControlLeft+M'),
    ).toBe(false);
    expect(acceleratorsMatch('ControlRight', 'ControlRight+ShiftLeft')).toBe(
      false,
    );
  });
});

describe('isSidedOrModifierOnlyAccelerator', () => {
  it('is true for a physical side or modifiers with no other key', () => {
    expect(isSidedOrModifierOnlyAccelerator('ControlRight')).toBe(true);
    expect(isSidedOrModifierOnlyAccelerator('ControlLeft+M')).toBe(true);
    expect(isSidedOrModifierOnlyAccelerator('Alt+Shift')).toBe(true);
  });

  it('is false for an unsided chord and for a bare key', () => {
    expect(isSidedOrModifierOnlyAccelerator('CommandOrControl+Shift+M')).toBe(
      false,
    );
    expect(isSidedOrModifierOnlyAccelerator('F12')).toBe(false);
    expect(isSidedOrModifierOnlyAccelerator('Conflict+Key')).toBe(false);
  });
});

describe('isElectronAccelerator', () => {
  it('accepts an unsided chord or a bare electron key', () => {
    expect(isElectronAccelerator('CommandOrControl+Shift+M')).toBe(true);
    expect(isElectronAccelerator('F12')).toBe(true);
    expect(isElectronAccelerator('Capslock')).toBe(true);
  });

  it('rejects a sided modifier and a modifier with no other key', () => {
    expect(isElectronAccelerator('ControlLeft+M')).toBe(false);
    expect(isElectronAccelerator('ControlRight')).toBe(false);
    expect(isElectronAccelerator('Alt+Shift')).toBe(false);
    expect(isElectronAccelerator('Pause')).toBe(false);
    expect(isElectronAccelerator('NumpadEnter')).toBe(false);
    expect(isElectronAccelerator(null)).toBe(false);
  });
});
