import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { resolveLanguage, t } from './i18n';
import { performQuitFlow } from './quit';
import { getExistingMainWindow } from './window';

let hasDeferredUpdate = false;
let updateDownloadedInfo: { version: string } | null = null;
let isInVoice = false;

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

export function setUpdaterVoiceActive(inVoice: boolean): void {
  isInVoice = inVoice;
  if (!isInVoice && hasDeferredUpdate && updateDownloadedInfo) {
    hasDeferredUpdate = false;
    promptRestartDialog(updateDownloadedInfo.version);
  }
}

function promptRestartDialog(version: string): void {
  const locale = resolveLanguage(app.getLocale());
  const win = getExistingMainWindow();
  const options = {
    type: 'info' as const,
    title: t('updater.downloaded', locale),
    message: t('updater.restartPrompt', locale, { version }),
    buttons: [t('updater.restart', locale), t('updater.later', locale)],
    defaultId: 0,
    cancelId: 1,
  };

  const messagePromise = win
    ? dialog.showMessageBox(win, options)
    : dialog.showMessageBox(options);

  messagePromise
    .then(({ response }) => {
      if (response === 0) {
        performQuitFlow(win, () => {
          autoUpdater.quitAndInstall();
        });
      }
    })
    .catch((err) => {
      logToFile(`[Updater] Prompt restart dialog error: ${err}`);
    });
}

export function checkForUpdatesManual(): void {
  const locale = resolveLanguage(app.getLocale());
  const win = getExistingMainWindow();

  if (
    !shouldCheckForUpdates({
      isPackaged: app.isPackaged,
      platform: process.platform,
      appImageEnv: process.env.APPIMAGE,
    })
  ) {
    const devOptions = {
      type: 'info' as const,
      title: 'Konvoez',
      message:
        'Running in development mode or non-AppImage installation. Auto-update is disabled.',
    };
    if (win) {
      void dialog.showMessageBox(win, devOptions);
    } else {
      void dialog.showMessageBox(devOptions);
    }
    return;
  }

  autoUpdater.checkForUpdates().catch((err) => {
    logToFile(`[Updater] Manual update check error: ${err}`);
    const errOptions = {
      type: 'warning' as const,
      title: 'Konvoez',
      message: t('updater.checkFailed', locale),
    };
    if (win) {
      void dialog.showMessageBox(win, errOptions);
    } else {
      void dialog.showMessageBox(errOptions);
    }
  });
}

export function initUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logToFile(`[Updater] Update available: ${info.version}`);
    const locale = resolveLanguage(app.getLocale());
    const win = getExistingMainWindow();
    const updateOptions = {
      type: 'info' as const,
      title: t('updater.updateAvailable', locale),
      message: t('updater.downloadPrompt', locale, { version: info.version }),
      buttons: [t('updater.download', locale), t('updater.later', locale)],
      defaultId: 0,
      cancelId: 1,
    };

    const updatePromise = win
      ? dialog.showMessageBox(win, updateOptions)
      : dialog.showMessageBox(updateOptions);

    updatePromise
      .then(({ response }) => {
        if (response === 0) {
          logToFile('[Updater] Downloading update...');
          autoUpdater.downloadUpdate().catch((err) => {
            logToFile(`[Updater] Download error: ${err}`);
          });
        }
      })
      .catch((err) => {
        logToFile(`[Updater] Prompt download dialog error: ${err}`);
      });
  });

  autoUpdater.on('update-not-available', () => {
    logToFile('[Updater] Update not available');
  });

  autoUpdater.on('update-downloaded', (info) => {
    logToFile(`[Updater] Update downloaded: ${info.version}`);
    updateDownloadedInfo = { version: info.version };

    if (isInVoice) {
      logToFile(
        '[Updater] User is in active voice call. Deferring restart prompt.',
      );
      hasDeferredUpdate = true;
      return;
    }

    promptRestartDialog(info.version);
  });

  autoUpdater.on('error', (err) => {
    logToFile(`[Updater] Error: ${err}`);
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
      autoUpdater.checkForUpdates().catch((err) => {
        logToFile(`[Updater] Initial check error: ${err}`);
      });
    }, 10_000);

    setInterval(
      () => {
        autoUpdater.checkForUpdates().catch((err) => {
          logToFile(`[Updater] Periodic check error: ${err}`);
        });
      },
      6 * 60 * 60 * 1000,
    );
  }
}
