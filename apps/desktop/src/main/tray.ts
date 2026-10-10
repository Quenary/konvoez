import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  powerSaveBlocker,
  Tray,
} from 'electron';
import {
  EDesktopCommand,
  EDesktopIpc,
  type TDesktopVoiceState,
} from '@konvoez/shared';
import type { ConfigStore } from './config-store';
import {
  getAppIcon,
  openLocalModal,
  setHasTray,
  showMainWindow,
} from './window';
import { performQuitFlow } from './quit';
import { checkForUpdatesManual } from './updater';
import { resolveLanguage, t } from './i18n';

let tray: Tray | null = null;
let currentVoiceState: TDesktopVoiceState = {
  inVoice: false,
  micMuted: false,
  speakerMuted: false,
};
let powerSaveId: number | null = null;

export function buildTrayMenuTemplate(options: {
  state: TDesktopVoiceState;
  isPwaLoaded: boolean;
  locale: string;
  onAction: (action: string) => void;
}): MenuItemConstructorOptions[] {
  const { state, isPwaLoaded, locale, onAction } = options;

  return [
    {
      label: t('tray.open', locale),
      click: () => onAction('open'),
    },
    {
      label: t('tray.muteMic', locale),
      type: 'checkbox',
      checked: state.micMuted,
      enabled: isPwaLoaded,
      click: () => onAction('toggle-mic'),
    },
    {
      label: t('tray.deafen', locale),
      type: 'checkbox',
      checked: state.speakerMuted,
      enabled: isPwaLoaded,
      click: () => onAction('toggle-speaker'),
    },
    { type: 'separator' },
    {
      label: t('tray.settings', locale),
      click: () => onAction('settings'),
    },
    {
      label: t('tray.changeServer', locale),
      click: () => onAction('change-server'),
    },
    {
      label: t('tray.checkUpdates', locale),
      click: () => onAction('check-updates'),
    },
    { type: 'separator' },
    {
      label: t('tray.quit', locale),
      click: () => onAction('quit'),
    },
  ];
}

export function updateTrayUI(
  win: BrowserWindow | null,
  configStore: ConfigStore,
): void {
  if (!tray) {
    return;
  }

  const locale = resolveLanguage(app.getLocale());
  let tooltip = 'Konvoez';
  if (currentVoiceState.micMuted) {
    tooltip += ` ${t('tray.micMuted', locale)}`;
  }
  if (currentVoiceState.speakerMuted) {
    tooltip += ` ${t('tray.deafened', locale)}`;
  }
  tray.setToolTip(tooltip);

  const serverOrigin = configStore.get().serverOrigin;
  const currentUrl = win && !win.isDestroyed() ? win.webContents.getURL() : '';
  const isPwaLoaded = Boolean(
    serverOrigin && currentUrl.startsWith(serverOrigin),
  );

  const template = buildTrayMenuTemplate({
    state: currentVoiceState,
    isPwaLoaded,
    locale,
    onAction: (action) => {
      switch (action) {
        case 'open':
          if (!configStore.get().serverOrigin) {
            openLocalModal('server', null, { width: 500, height: 400 });
          } else {
            showMainWindow(win);
          }
          break;
        case 'toggle-mic':
          if (win && !win.isDestroyed()) {
            win.webContents.send(
              EDesktopIpc.COMMAND,
              EDesktopCommand.TOGGLE_MIC,
            );
          }
          break;
        case 'toggle-speaker':
          if (win && !win.isDestroyed()) {
            win.webContents.send(
              EDesktopIpc.COMMAND,
              EDesktopCommand.TOGGLE_SPEAKER,
            );
          }
          break;
        case 'settings':
          openLocalModal('settings', win, { width: 550, height: 480 });
          break;
        case 'changeServer':
        case 'change-server':
          openLocalModal('server', win, { width: 500, height: 400 });
          break;
        case 'check-updates':
          checkForUpdatesManual();
          break;
        case 'quit':
          performQuitFlow(win);
          break;
      }
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

let trayWindow: BrowserWindow | null = null;
let trayConfigStore: ConfigStore | null = null;

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
  if (targetWin && targetConfig) {
    updateTrayUI(targetWin, targetConfig);
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
    updateTrayUI(win, configStore);
    setHasTray(true);
    return tray;
  } catch (err) {
    console.warn('[Tray] Failed to create Tray icon:', err);
    setHasTray(false);
    return null;
  }
}
