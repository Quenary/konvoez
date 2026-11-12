const MODIFIER_CODE_TO_TOKEN: Record<string, string> = {
  ControlLeft: 'ControlLeft',
  ControlRight: 'ControlRight',
  AltLeft: 'AltLeft',
  AltRight: 'AltRight',
  ShiftLeft: 'ShiftLeft',
  ShiftRight: 'ShiftRight',
  MetaLeft: 'MetaLeft',
  MetaRight: 'MetaRight',
};

const CODE_TO_ACCELERATOR_KEY: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Return',
  NumpadEnter: 'NumpadEnter',
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
  CapsLock: 'Capslock',
  NumLock: 'Numlock',
  ScrollLock: 'Scrolllock',
  PrintScreen: 'PrintScreen',
  Pause: 'Pause',
  ContextMenu: 'ContextMenu',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaStop: 'MediaStop',
  AudioVolumeMute: 'VolumeMute',
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
};

/** Unsided tokens. A stored chord with one of these matches either physical side. */
const UNSIDED_MODIFIERS: Record<string, string> = {
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  control: 'CommandOrControl',
  ctrl: 'CommandOrControl',
  command: 'CommandOrControl',
  cmd: 'CommandOrControl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
};

const SIDED_MODIFIERS: Record<string, string> = {
  controlleft: 'ControlLeft',
  controlright: 'ControlRight',
  altleft: 'AltLeft',
  altright: 'AltRight',
  shiftleft: 'ShiftLeft',
  shiftright: 'ShiftRight',
  metaleft: 'MetaLeft',
  metaright: 'MetaRight',
};

const ELECTRON_MODIFIERS = new Set([
  'CommandOrControl',
  'Alt',
  'Shift',
  'Super',
]);

const ELECTRON_KEYS = new Set([
  ...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
  'Space',
  'Tab',
  'Capslock',
  'Numlock',
  'Scrolllock',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Esc',
  'VolumeUp',
  'VolumeDown',
  'VolumeMute',
  'MediaNextTrack',
  'MediaPreviousTrack',
  'MediaStop',
  'MediaPlayPause',
  'PrintScreen',
  'Plus',
  '-',
  '=',
  '[',
  ']',
  ';',
  "'",
  ',',
  '.',
  '/',
  '\\',
  '`',
  ...Array.from({ length: 10 }, (_, index) => `num${index}`),
  'numdec',
  'numadd',
  'numsub',
  'nummult',
  'numdiv',
]);

interface IAcceleratorChord {
  modifiers: string[];
  key: string | null;
}

export function isModifierCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODIFIER_CODE_TO_TOKEN, code);
}

function codeToAcceleratorKey(code: string): string | null {
  if (code === 'Escape' || code === 'Backspace') {
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
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code;
  }
  return CODE_TO_ACCELERATOR_KEY[code] ?? null;
}

function canonicalModifier(part: string): string | null {
  const lower = part.trim().toLowerCase();
  return SIDED_MODIFIERS[lower] ?? UNSIDED_MODIFIERS[lower] ?? null;
}

function canonicalKey(part: string): string {
  const trimmed = part.trim();
  if (trimmed.length === 1 && /[a-zA-Z]/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

function parseChord(normalized: string | null): IAcceleratorChord | null {
  if (!normalized) {
    return null;
  }
  const modifiers: string[] = [];
  let key: string | null = null;
  for (const part of normalized.split('+')) {
    if (canonicalModifier(part)) {
      modifiers.push(part);
      continue;
    }
    if (key !== null) {
      return null;
    }
    key = part;
  }
  if (modifiers.length === 0 && key === null) {
    return null;
  }
  return { modifiers, key };
}

function modifierFamily(
  token: string,
): 'alt' | 'ctrl' | 'shift' | 'super' | null {
  switch (token) {
    case 'CommandOrControl':
    case 'ControlLeft':
    case 'ControlRight':
      return 'ctrl';
    case 'Alt':
    case 'AltLeft':
    case 'AltRight':
      return 'alt';
    case 'Shift':
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'shift';
    case 'Super':
    case 'MetaLeft':
    case 'MetaRight':
      return 'super';
    default:
      return null;
  }
}

function modifierSatisfied(stored: string, pressed: string): boolean {
  if (stored === pressed) {
    return true;
  }
  const storedFamily = modifierFamily(stored);
  const pressedFamily = modifierFamily(pressed);
  if (storedFamily === null || storedFamily !== pressedFamily) {
    return false;
  }
  return (
    stored === 'CommandOrControl' ||
    stored === 'Alt' ||
    stored === 'Shift' ||
    stored === 'Super'
  );
}

function modifiersMatch(stored: string[], pressed: string[]): boolean {
  const remaining = [...pressed];
  for (const modifier of stored) {
    const index = remaining.findIndex((candidate) =>
      modifierSatisfied(modifier, candidate),
    );
    if (index < 0) {
      return false;
    }
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

/** Formats physical `KeyboardEvent.code` values into one accelerator string. */
export function formatKeyboardEventToAccelerator(
  codes: readonly string[],
): string | null {
  const modifiers: string[] = [];
  const keys: string[] = [];
  const seenModifiers = new Set<string>();

  for (const code of codes) {
    const modifier = MODIFIER_CODE_TO_TOKEN[code];
    if (modifier) {
      if (!seenModifiers.has(modifier)) {
        seenModifiers.add(modifier);
        modifiers.push(modifier);
      }
      continue;
    }
    const key = codeToAcceleratorKey(code);
    if (!key) {
      return null;
    }
    keys.push(key);
  }

  if (keys.length > 1 || (keys.length === 0 && modifiers.length === 0)) {
    return null;
  }

  modifiers.sort();
  return [...modifiers, ...keys].join('+');
}

export function normalizeAccelerator(
  accel: string | null | undefined,
): string | null {
  if (!accel || !accel.trim()) {
    return null;
  }

  const parts = accel
    .trim()
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }

  const modifiers: string[] = [];
  const others: string[] = [];
  for (const part of parts) {
    const modifier = canonicalModifier(part);
    if (modifier) {
      if (!modifiers.includes(modifier)) {
        modifiers.push(modifier);
      }
    } else {
      others.push(part);
    }
  }

  if (others.length === 0) {
    if (modifiers.length === 0) {
      return null;
    }
    modifiers.sort();
    return modifiers.join('+');
  }

  const rawMain = others.pop();
  if (!rawMain) {
    return null;
  }
  for (const extra of others) {
    const trimmed = extra.trim();
    if (!modifiers.includes(trimmed)) {
      modifiers.push(trimmed);
    }
  }

  modifiers.sort();
  return [...modifiers, canonicalKey(rawMain)].join('+');
}

/**
 * `CommandOrControl`, `Alt`, `Shift` and `Super` match either side.
 * A sided token matches that side only. Extra pressed modifiers do not match.
 */
export function acceleratorsMatch(
  stored: string | null | undefined,
  pressed: string | null | undefined,
): boolean {
  const storedChord = parseChord(normalizeAccelerator(stored));
  const pressedChord = parseChord(normalizeAccelerator(pressed));
  if (!storedChord || !pressedChord) {
    return false;
  }
  if (storedChord.key !== pressedChord.key) {
    return false;
  }
  return modifiersMatch(storedChord.modifiers, pressedChord.modifiers);
}

const SIDED_MODIFIER_TOKENS = new Set(Object.values(SIDED_MODIFIERS));

/** A left/right modifier, or a chord made only of modifiers. `globalShortcut` cannot register either. */
export function isSidedOrModifierOnlyAccelerator(
  accel: string | null | undefined,
): boolean {
  const chord = parseChord(normalizeAccelerator(accel));
  if (!chord) {
    return false;
  }
  if (chord.key === null) {
    return true;
  }
  return chord.modifiers.some((modifier) =>
    SIDED_MODIFIER_TOKENS.has(modifier),
  );
}

/** Electron `globalShortcut` and menu accelerators have no left/right side and need a non-modifier key. */
export function isElectronAccelerator(
  accel: string | null | undefined,
): boolean {
  const chord = parseChord(normalizeAccelerator(accel));
  if (!chord?.key || !ELECTRON_KEYS.has(chord.key)) {
    return false;
  }
  return chord.modifiers.every((modifier) => ELECTRON_MODIFIERS.has(modifier));
}
