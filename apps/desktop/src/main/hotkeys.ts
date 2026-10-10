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

  return { toggleMic, toggleSpeaker };
}

export function initHotkeys(): void {
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
