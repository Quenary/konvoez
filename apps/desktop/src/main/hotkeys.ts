import { app, BrowserWindow, globalShortcut, powerMonitor } from 'electron';
import {
  EDesktopCommand,
  EDesktopIpc,
  type TDesktopHotkeys,
} from '@konvoez/shared';
import {
  acceleratorsMatch,
  formatKeyboardEventToAccelerator,
  isModifierCode,
  isSidedOrModifierOnlyAccelerator,
  type THotkeyStatus,
} from '@konvoez/client-shell';
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
// Windows sends Left Ctrl immediately before Right Alt. A physical Left Ctrl
// held longer than this stays part of the chord.
const ALT_GR_CTRL_MS = 50;

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
  if (event.code === 'AltRight') {
    const controlLeftAt = pressedAt.get('ControlLeft');
    if (controlLeftAt !== undefined && now - controlLeftAt <= ALT_GR_CTRL_MS) {
      pressedKeys.delete('ControlLeft');
      pressedAt.delete('ControlLeft');
    }
  }

  if (suspendDepth > 0 || !storedHotkeys) {
    return;
  }

  const heldModifiers = [...pressedKeys].filter((code) => isModifierCode(code));
  const codes = isModifierCode(event.code)
    ? heldModifiers
    : [...heldModifiers, event.code];
  const accelerator = formatKeyboardEventToAccelerator(codes);

  if (!accelerator) {
    return;
  }

  if (acceleratorsMatch(storedHotkeys.toggleMic, accelerator)) {
    onCommand(EDesktopCommand.TOGGLE_MIC);
  } else if (acceleratorsMatch(storedHotkeys.toggleSpeaker, accelerator)) {
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
    if (isSidedOrModifierOnlyAccelerator(accelerator)) {
      return 'invalid';
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
