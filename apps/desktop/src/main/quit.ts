import { app, type BrowserWindow } from 'electron';
import { EDesktopCommand, EDesktopIpc } from '@konvoez/shared';

let quitting = false;
let quitReadyCallback: (() => void) | null = null;

export function isQuitting(): boolean {
  return quitting;
}

export function notifyQuitReady(): void {
  if (quitReadyCallback) {
    const cb = quitReadyCallback;
    quitReadyCallback = null;
    cb();
  }
}

export function performQuitFlow(
  win: BrowserWindow | null,
  quitFn: () => void = () => app.quit(),
  timeoutMs = 3000,
): void {
  if (quitting) {
    return;
  }
  quitting = true;

  if (!win || win.isDestroyed() || !win.webContents) {
    quitFn();
    return;
  }

  let timer: NodeJS.Timeout | null = null;

  const finishQuit = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    quitReadyCallback = null;
    quitFn();
  };

  quitReadyCallback = finishQuit;

  timer = setTimeout(() => {
    finishQuit();
  }, timeoutMs);

  try {
    win.webContents.send(EDesktopIpc.COMMAND, EDesktopCommand.QUIT_REQUESTED);
  } catch {
    finishQuit();
  }
}

export function resetQuittingStateForTests(): void {
  quitting = false;
  quitReadyCallback = null;
}
