import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  powerSaveBlocker,
  Tray,
} from 'electron';
import type { TDesktopVoiceState } from '@konvoez/shared';
import type { ConfigStore } from './config-store';
import { buildActionItems, runAppAction, type TAppAction } from './app-actions';
import { buildAppMenuTemplate } from './app-menu';
import {
  getAppIcon,
  openLocalModal,
  setHasTray,
  showMainWindow,
} from './window';
import { resolveLanguage, t } from './i18n';

let tray: Tray | null = null;
let currentVoiceState: TDesktopVoiceState = {
  inVoice: false,
  micMuted: false,
  speakerMuted: false,
};
let powerSaveId: number | null = null;
let trayWindow: BrowserWindow | null = null;
let trayConfigStore: ConfigStore | null = null;

export function buildTrayMenuTemplate(
  options: Parameters<typeof buildActionItems>[0],
): MenuItemConstructorOptions[] {
  const items = buildActionItems(options);
  return [
    items.open,
    items['toggle-mic'],
    items['toggle-speaker'],
    { type: 'separator' },
    items.settings,
    items['change-server'],
    items['check-updates'],
    { type: 'separator' },
    items.quit,
  ];
}

export function refreshMenus(
  win: BrowserWindow | null,
  configStore: ConfigStore,
): void {
  trayWindow = win ?? trayWindow;
  trayConfigStore = configStore;

  const targetWin = win ?? trayWindow;
  const locale = resolveLanguage(app.getLocale());

  if (tray) {
    let tooltip = 'Konvoez';
    if (currentVoiceState.micMuted) {
      tooltip += ` ${t('tray.micMuted', locale)}`;
    }
    if (currentVoiceState.speakerMuted) {
      tooltip += ` ${t('tray.deafened', locale)}`;
    }
    tray.setToolTip(tooltip);
  }

  const config = configStore.get();
  const serverOrigin = config.serverOrigin;
  const currentUrl =
    targetWin && !targetWin.isDestroyed() ? targetWin.webContents.getURL() : '';
  const isPwaLoaded = Boolean(
    serverOrigin && currentUrl.startsWith(serverOrigin),
  );

  const ctx = { win: targetWin, configStore };
  const run = (action: TAppAction) => runAppAction(action, ctx);

  const items = buildActionItems({
    state: currentVoiceState,
    isPwaLoaded,
    locale,
    run,
    withAccelerators: true,
    hotkeys: config.hotkeys,
  });

  if (tray) {
    const trayTemplate = buildTrayMenuTemplate({
      state: currentVoiceState,
      isPwaLoaded,
      locale,
      run,
      withAccelerators: true,
      hotkeys: config.hotkeys,
    });
    tray.setContextMenu(Menu.buildFromTemplate(trayTemplate));
  }

  const appMenuTemplate = buildAppMenuTemplate(items, locale, {
    isPackaged: app.isPackaged,
    onCloseWindow: () => {
      if (targetWin && !targetWin.isDestroyed()) {
        targetWin.close();
      }
    },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate));
}

export function bindMenuRefresh(
  win: BrowserWindow,
  configStore: ConfigStore,
): void {
  const refresh = () => refreshMenus(win, configStore);
  win.webContents.on('did-finish-load', refresh);
  win.webContents.on('did-navigate-in-page', refresh);
}

export function setVoiceState(
  newState: TDesktopVoiceState,
  win?: BrowserWindow | null,
  configStore?: ConfigStore,
): void {
  const wasInVoice = currentVoiceState.inVoice;
  currentVoiceState = { ...newState };

  if (!wasInVoice && newState.inVoice) {
    if (powerSaveId === null) {
      powerSaveId = powerSaveBlocker.start('prevent-app-suspension');
    }
  } else if (wasInVoice && !newState.inVoice) {
    if (powerSaveId !== null) {
      if (powerSaveBlocker.isStarted(powerSaveId)) {
        powerSaveBlocker.stop(powerSaveId);
      }
      powerSaveId = null;
    }
  }

  const targetWin = win ?? trayWindow;
  const targetConfig = configStore ?? trayConfigStore;
  if (targetConfig) {
    refreshMenus(targetWin, targetConfig);
  }
}

export function createTray(
  win: BrowserWindow | null,
  configStore: ConfigStore,
): Tray | null {
  trayWindow = win;
  trayConfigStore = configStore;

  try {
    const icon = getAppIcon();
    if (!icon) {
      setHasTray(false);
      return null;
    }
    tray = new Tray(icon);
    tray.on('click', () => {
      if (!configStore.get().serverOrigin) {
        openLocalModal('server', null, { width: 500, height: 400 });
      } else {
        showMainWindow(win);
      }
    });
    setHasTray(true);
    return tray;
  } catch (err) {
    console.warn('[Tray] Failed to create Tray icon:', err);
    setHasTray(false);
    return null;
  }
}
