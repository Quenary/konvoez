import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, type BrowserWindow } from 'electron';
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from 'electron-updater';
import { EDesktopIpc } from '@konvoez/shared';
import type { IUpdaterProgress, IUpdaterState } from '@konvoez/client-shell';
import { performQuitFlow } from './quit';
import { getExistingMainWindow, openLocalModal } from './window';

let hasDeferredUpdate = false;
let updateDownloadedInfo: { version: string } | null = null;
let isInVoice = false;
let lastFailedStep: 'check' | 'download' | null = null;
let lastLoggedDownloadPercent = -1;

let updaterState: IUpdaterState = { status: 'checking' };
let updaterWindow: BrowserWindow | null = null;

export function shouldCheckForUpdates(params: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  appImageEnv?: string;
}): boolean {
  if (!params.isPackaged) {
    return false;
  }
  if (params.platform === 'linux' && !params.appImageEnv) {
    return false;
  }
  return true;
}

export function logToFile(message: string): void {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = path.join(logsDir, 'main.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`, 'utf-8');
  } catch {
    // ignore logging failure
  }
}

export function getUpdaterState(): IUpdaterState {
  return updaterState;
}

export function setUpdaterState(partial: Partial<IUpdaterState>): void {
  updaterState = { ...updaterState, ...partial };
  if (
    updaterWindow &&
    !updaterWindow.isDestroyed() &&
    !updaterWindow.webContents.isDestroyed()
  ) {
    updaterWindow.webContents.send(
      EDesktopIpc.LOCAL_UPDATER_STATE,
      updaterState,
    );
  }
}

export function showUpdaterWindow(): BrowserWindow {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    if (updaterWindow.isMinimized()) {
      updaterWindow.restore();
    }
    if (!updaterWindow.isVisible()) {
      updaterWindow.show();
    }
    updaterWindow.focus();
    return updaterWindow;
  }

  const mainWin = getExistingMainWindow();
  const parent =
    mainWin && !mainWin.isDestroyed() && mainWin.isVisible() ? mainWin : null;

  updaterWindow = openLocalModal('updater', parent, {
    width: 440,
    height: 300,
    resizable: false,
    modal: false,
    onClosed: () => {
      updaterWindow = null;
    },
  });

  return updaterWindow;
}

export function closeUpdaterWindow(): void {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.close();
    updaterWindow = null;
  }
}

export function handleUpdaterDownload(): void {
  lastFailedStep = null;
  lastLoggedDownloadPercent = -1;
  setUpdaterState({
    status: 'downloading',
    progress: { percent: 0 },
    error: undefined,
  });
  logToFile('[Updater] Downloading update...');
  autoUpdater.downloadUpdate().catch((err: unknown) => {
    logToFile(`[Updater] Download error: ${err}`);
    reportDownloadFailure();
  });
}

function reportDownloadFailure(): void {
  lastFailedStep = 'download';
  setUpdaterState({
    status: 'error',
    error: 'updater.downloadFailed',
  });
  showUpdaterWindow();
}

export function handleUpdaterLater(): void {
  closeUpdaterWindow();
}

export function handleUpdaterRestart(): void {
  const win = getExistingMainWindow();
  performQuitFlow(win, () => {
    autoUpdater.quitAndInstall();
  });
}

export function handleUpdaterRetry(): void {
  if (lastFailedStep === 'download') {
    handleUpdaterDownload();
  } else {
    checkForUpdatesManual();
  }
}

export function setUpdaterVoiceActive(inVoice: boolean): void {
  isInVoice = inVoice;
  if (!isInVoice && hasDeferredUpdate && updateDownloadedInfo) {
    hasDeferredUpdate = false;
    setUpdaterState({
      status: 'ready',
      version: updateDownloadedInfo.version,
    });
    showUpdaterWindow();
  }
}

export function checkForUpdatesManual(): void {
  showUpdaterWindow();

  if (
    !shouldCheckForUpdates({
      isPackaged: app.isPackaged,
      platform: process.platform,
      appImageEnv: process.env.APPIMAGE,
    })
  ) {
    setUpdaterState({
      status: 'disabled',
      error: undefined,
    });
    return;
  }

  lastFailedStep = null;
  setUpdaterState({
    status: 'checking',
    error: undefined,
    progress: undefined,
  });

  autoUpdater.checkForUpdates().catch((err: unknown) => {
    logToFile(`[Updater] Manual update check error: ${err}`);
    lastFailedStep = 'check';
    setUpdaterState({
      status: 'error',
      error: 'updater.checkFailed',
    });
  });
}

export function initUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logToFile(`[Updater] Update available: ${info.version}`);
    setUpdaterState({
      status: 'available',
      version: info.version,
      error: undefined,
    });
    showUpdaterWindow();
  });

  autoUpdater.on('update-not-available', () => {
    logToFile('[Updater] Update not available');
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      setUpdaterState({
        status: 'up-to-date',
        error: undefined,
      });
    }
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const p: IUpdaterProgress = {
      percent: Math.min(100, Math.max(0, Math.round(progress.percent))),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    };
    logDownloadProgress(p.percent);
    setUpdaterState({
      status: 'downloading',
      progress: p,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logToFile(`[Updater] Update downloaded: ${info.version}`);
    updateDownloadedInfo = { version: info.version };

    if (isInVoice) {
      logToFile(
        '[Updater] User is in active voice call. Deferring restart prompt.',
      );
      hasDeferredUpdate = true;
      setUpdaterState({
        status: 'ready-deferred',
        version: info.version,
      });
      showUpdaterWindow();
      return;
    }

    const win = getExistingMainWindow();
    performQuitFlow(win, () => {
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err: Error) => {
    logToFile(`[Updater] Error: ${err}`);
    const windowOpen = Boolean(updaterWindow && !updaterWindow.isDestroyed());
    const isDownloadError = updaterState.status === 'downloading';
    if (!windowOpen && !isDownloadError) {
      return;
    }
    if (isDownloadError) {
      reportDownloadFailure();
      return;
    }
    lastFailedStep = 'check';
    setUpdaterState({
      status: 'error',
      error: 'updater.checkFailed',
    });
  });

  // Scheduled check
  if (
    shouldCheckForUpdates({
      isPackaged: app.isPackaged,
      platform: process.platform,
      appImageEnv: process.env.APPIMAGE,
    })
  ) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: unknown) => {
        logToFile(`[Updater] Initial check error: ${err}`);
      });
    }, 10_000);

    setInterval(
      () => {
        autoUpdater.checkForUpdates().catch((err: unknown) => {
          logToFile(`[Updater] Periodic check error: ${err}`);
        });
      },
      6 * 60 * 60 * 1000,
    );
  }
}

function logDownloadProgress(percent: number): void {
  if (
    percent < 10 ||
    percent % 10 !== 0 ||
    percent === lastLoggedDownloadPercent
  ) {
    return;
  }
  lastLoggedDownloadPercent = percent;
  logToFile(`[Updater] Download progress: ${percent}%`);
}

export function _resetUpdaterStateForTesting(): void {
  hasDeferredUpdate = false;
  updateDownloadedInfo = null;
  isInVoice = false;
  lastFailedStep = null;
  lastLoggedDownloadPercent = -1;
  updaterState = { status: 'checking' };
  updaterWindow = null;
}
