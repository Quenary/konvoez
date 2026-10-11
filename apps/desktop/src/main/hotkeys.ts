import { app, BrowserWindow, globalShortcut } from 'electron';
import {
  EDesktopCommand,
  EDesktopIpc,
  type TDesktopHotkeys,
} from '@konvoez/shared';
import { getExistingMainWindow } from './window';

export type THotkeyStatus = 'ok' | 'conflict' | 'invalid' | 'unset';

export interface IDesktopHotkeyStatuses {
  toggleMic: THotkeyStatus;
  toggleSpeaker: THotkeyStatus;
}

export { formatKeyboardEventToAccelerator } from './accelerator';

let storedHotkeys: TDesktopHotkeys | null = null;
let suspendDepth = 0;

export function resetHotkeyStateForTests(): void {
  storedHotkeys = null;
  suspendDepth = 0;
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

  if (suspendDepth === 0 && storedHotkeys) {
    applyHotkeys(storedHotkeys, shortcutManager, onCommand);
  }
}

export function initHotkeys(): void {
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
