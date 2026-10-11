const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

const CODE_TO_ACCELERATOR_KEY: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Return',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaStop: 'MediaStop',
  AudioVolumeMute: 'VolumeMute',
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
};

function isFunctionKeyCode(code: string): boolean {
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(code);
}

function codeToAcceleratorKey(code: string): string | null {
  if (MODIFIER_CODES.has(code) || code === 'Escape') {
    return null;
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad') && code.length === 7) {
    const digit = code.slice(6);
    if (/^\d$/.test(digit)) {
      return `num${digit}`;
    }
  }
  if (isFunctionKeyCode(code)) {
    return code;
  }
  return CODE_TO_ACCELERATOR_KEY[code] ?? null;
}

export function formatKeyboardEventToAccelerator(e: {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): string | null {
  const mainKey = codeToAcceleratorKey(e.code);
  if (!mainKey) {
    return null;
  }

  const parts: string[] = [];

  if (e.ctrlKey) {
    parts.push('CommandOrControl');
  }
  if (e.metaKey) {
    parts.push('Super');
  }
  if (e.altKey) {
    parts.push('Alt');
  }
  if (e.shiftKey) {
    parts.push('Shift');
  }

  parts.push(mainKey);
  return parts.join('+');
}
