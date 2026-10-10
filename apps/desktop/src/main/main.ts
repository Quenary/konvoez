import { app, powerMonitor, session } from 'electron';
import { ConfigStore } from './config-store';
import {
  createMainWindow,
  getExistingMainWindow,
  getLocalPagePath,
  showMainWindow,
} from './window';
import { installSecurityHandlers } from './security';
import { installDisplayMediaHandler } from './display-media';
import { registerIpc } from './ipc';
import { createTray } from './tray';
import { applyHotkeys, initHotkeys } from './hotkeys';
import { isQuitting, performQuitFlow } from './quit';
import { initUpdater } from './updater';

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.quenary.konvoez');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

  app.on('second-instance', () => {
    const win = getExistingMainWindow();
    if (win) {
      showMainWindow(win);
    }
  });

  app.on('before-quit', (event) => {
    if (!isQuitting()) {
      event.preventDefault();
      const win = getExistingMainWindow();
      performQuitFlow(win);
    }
  });

  powerMonitor.on('shutdown', () => {
    const win = getExistingMainWindow();
    performQuitFlow(win);
  });

  app.on('window-all-closed', () => {
    // Remain active in tray on both Windows and Linux
  });

  app.whenReady().then(() => {
    const configStore = new ConfigStore();
    const config = configStore.get();

    installSecurityHandlers(
      session.defaultSession,
      () => configStore.get().serverOrigin,
    );
    installDisplayMediaHandler(
      session.defaultSession,
      () => configStore.get().serverOrigin,
      () => getExistingMainWindow(),
    );
    registerIpc(configStore, () => getExistingMainWindow());

    const win = createMainWindow(configStore);

    if (config.serverOrigin) {
      void win.loadURL(config.serverOrigin);
    } else {
      void win.loadFile(getLocalPagePath('server'));
    }

    createTray(win, configStore);
    applyHotkeys(config.hotkeys);
    initHotkeys();
    initUpdater();
  });
}
