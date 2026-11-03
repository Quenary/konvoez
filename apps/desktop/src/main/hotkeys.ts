import { app, BrowserWindow, globalShortcut, powerMonitor } from 'electron';
import {
  EDesktopCommand,
  EDesktopIpc,
  type TDesktopHotkeys,
} from '@konvoez/shared';
import type { THotkeyStatus } from '@konvoez/client-shell';
import { formatKeyboardEventToAccelerator } from '@konvoez/client-shell';
import { getExistingMainWindow } from './window';
import { getNativeModule, type KeyHookHandle } from './native';

export interface IDesktopHotkeyStatuses {
  [key: string]: THotkeyStatus;
  toggleMic: THotkeyStatus;
  toggleSpeaker: THotkeyStatus;
}

export { formatKeyboardEventToAccelerator } from '@konvoez/client-shell';

let storedHotkeys: TDesktopHotkeys | null = null;
let suspendDepth = 0;
let activeKeyHookHandle: KeyHookHandle | null = null;
const pressedKeys = new Set<string>();
const pressedAt = new Map<string, number>();
const KEY_HELD_GAP_MS = 2000;

function clearPressedKeys(): void {
  pressedKeys.clear();
  pressedAt.clear();
}

export function resetHotkeyStateForTests(): void {
  storedHotkeys = null;
  suspendDepth = 0;
  if (activeKeyHookHandle) {
    try {
      activeKeyHookHandle.stop();
    } catch {
      // ignore
    }
    activeKeyHookHandle = null;
  }
  clearPressedKeys();
}

const MODIFIER_SYNONYMS: Record<string, string> = {
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

export function normalizeAccelerator(
  accel: string | null | undefined,
): string | null {
  if (!accel || !accel.trim()) return null;
  const parts = accel.trim().split('+');
  const rawMainKey = parts.pop();
  if (!rawMainKey || !rawMainKey.trim()) return null;

  const normalizedModifiers = parts.map((part) => {
    const lower = part.trim().toLowerCase();
    return MODIFIER_SYNONYMS[lower] ?? part.trim();
  });
  normalizedModifiers.sort();

  let mainKey = rawMainKey.trim();
  if (mainKey.length === 1 && /[a-zA-Z]/.test(mainKey)) {
    mainKey = mainKey.toUpperCase();
  } else if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(mainKey)) {
    mainKey = mainKey.toUpperCase();
  }

  return [...normalizedModifiers, mainKey].join('+');
}

export function handleNativeKeyEvent(
  event: { code: string; down: boolean; repeat?: boolean },
  onCommand: (command: EDesktopCommand) => void,
): void {
  if (!event.down) {
    pressedKeys.delete(event.code);
    pressedAt.delete(event.code);
    return;
  }

  const now = Date.now();
  const lastSeen = pressedAt.get(event.code);
  const heldTooLong =
    pressedKeys.has(event.code) &&
    lastSeen !== undefined &&
    now - lastSeen >= KEY_HELD_GAP_MS;
  if (heldTooLong) {
    pressedKeys.delete(event.code);
  }

  // Windows repeats KEYDOWN while a key is held. X11 detectable autorepeat
  // is a release plus a press with the same timestamp, marked `repeat`.
  // A down after a long silence is a new press: the release was lost.
  if (!heldTooLong && (event.repeat || pressedKeys.has(event.code))) {
    pressedKeys.add(event.code);
    pressedAt.set(event.code, now);
    return;
  }
  pressedKeys.add(event.code);
  pressedAt.set(event.code, now);

  if (suspendDepth > 0 || !storedHotkeys) {
    return;
  }

  const ctrlKey =
    pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight');
  const altKey = pressedKeys.has('AltLeft') || pressedKeys.has('AltRight');
  const shiftKey =
    pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight');
  const metaKey = pressedKeys.has('MetaLeft') || pressedKeys.has('MetaRight');

  const accelerator = formatKeyboardEventToAccelerator({
    code: event.code,
    ctrlKey,
    altKey,
    shiftKey,
    metaKey,
  });

  if (!accelerator) {
    return;
  }

  const normalizedPressed = normalizeAccelerator(accelerator);
  const normalizedMic = normalizeAccelerator(storedHotkeys.toggleMic);
  const normalizedSpeaker = normalizeAccelerator(storedHotkeys.toggleSpeaker);

  if (normalizedMic && normalizedPressed === normalizedMic) {
    onCommand(EDesktopCommand.TOGGLE_MIC);
  } else if (normalizedSpeaker && normalizedPressed === normalizedSpeaker) {
    onCommand(EDesktopCommand.TOGGLE_SPEAKER);
  }
}

function sendDesktopCommand(
  command: EDesktopCommand,
  win?: BrowserWindow | null,
): void {
  const target = win ?? getExistingMainWindow();
  if (target && !target.isDestroyed()) {
    target.webContents.send(EDesktopIpc.COMMAND, command);
  }
}

export function applyHotkeys(
  hotkeys: TDesktopHotkeys,
  shortcutManager: typeof globalShortcut = globalShortcut,
  onCommand: (command: EDesktopCommand) => void = sendDesktopCommand,
): IDesktopHotkeyStatuses {
  storedHotkeys = hotkeys;

  const nativeMod = getNativeModule();
  const useNative = nativeMod?.isKeyHookSupported() ?? false;

  if (useNative && nativeMod) {
    shortcutManager.unregisterAll();

    const hasAnyHotkey = Boolean(
      hotkeys.toggleMic?.trim() || hotkeys.toggleSpeaker?.trim(),
    );

    if (hasAnyHotkey && !activeKeyHookHandle) {
      try {
        clearPressedKeys();
        activeKeyHookHandle = nativeMod.startKeyHook((event) => {
          handleNativeKeyEvent(event, onCommand);
        });
      } catch (err) {
        console.warn('[Hotkeys] Failed to start native key hook:', err);
        activeKeyHookHandle = null;
      }
    } else if (!hasAnyHotkey && activeKeyHookHandle) {
      try {
        activeKeyHookHandle.stop();
      } catch {
        // ignore
      }
      activeKeyHookHandle = null;
      clearPressedKeys();
    }

    if (activeKeyHookHandle || !hasAnyHotkey) {
      const toggleMic: THotkeyStatus = hotkeys.toggleMic?.trim()
        ? 'ok'
        : 'unset';
      const toggleSpeaker: THotkeyStatus = hotkeys.toggleSpeaker?.trim()
        ? 'ok'
        : 'unset';

      return { toggleMic, toggleSpeaker };
    }
  }

  // Fallback to globalShortcut
  if (activeKeyHookHandle) {
    try {
      activeKeyHookHandle.stop();
    } catch {
      // ignore
    }
    activeKeyHookHandle = null;
    clearPressedKeys();
  }

  shortcutManager.unregisterAll();

  const registerKey = (
    accelerator: string | null,
    command: EDesktopCommand,
  ): THotkeyStatus => {
    if (!accelerator || !accelerator.trim()) {
      return 'unset';
    }
    try {
      const success = shortcutManager.register(accelerator.trim(), () => {
        onCommand(command);
      });
      return success ? 'ok' : 'conflict';
    } catch {
      return 'invalid';
    }
  };

  const toggleMic = registerKey(hotkeys.toggleMic, EDesktopCommand.TOGGLE_MIC);
  const toggleSpeaker = registerKey(
    hotkeys.toggleSpeaker,
    EDesktopCommand.TOGGLE_SPEAKER,
  );

  if (suspendDepth > 0) {
    shortcutManager.unregisterAll();
  }

  return { toggleMic, toggleSpeaker };
}

export function suspendHotkeys(
  shortcutManager: typeof globalShortcut = globalShortcut,
): void {
  suspendDepth += 1;
  clearPressedKeys();
  if (suspendDepth === 1) {
    shortcutManager.unregisterAll();
  }
}

export function resumeHotkeysAfterSettingsClosed(): void {
  resumeHotkeys(globalShortcut, sendDesktopCommand, {
    resetSuspendDepth: true,
  });
}

export function resumeHotkeys(
  shortcutManager: typeof globalShortcut = globalShortcut,
  onCommand: (command: EDesktopCommand) => void = sendDesktopCommand,
  options?: { resetSuspendDepth?: boolean },
): void {
  if (options?.resetSuspendDepth) {
    suspendDepth = 0;
  } else if (suspendDepth > 0) {
    suspendDepth -= 1;
  } else {
    return;
  }
  clearPressedKeys();

  if (suspendDepth === 0 && storedHotkeys) {
    applyHotkeys(storedHotkeys, shortcutManager, onCommand);
  }
}

export function initHotkeys(): void {
  powerMonitor.on('lock-screen', () => {
    clearPressedKeys();
  });
  app.on('will-quit', () => {
    if (activeKeyHookHandle) {
      try {
        activeKeyHookHandle.stop();
      } catch {
        // ignore
      }
      activeKeyHookHandle = null;
    }
    globalShortcut.unregisterAll();
  });
}
