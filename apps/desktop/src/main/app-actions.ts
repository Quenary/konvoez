import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import {
  EDesktopCommand,
  EDesktopIpc,
  type TDesktopHotkeys,
  type TDesktopVoiceState,
} from '@konvoez/shared';
import type { ConfigStore } from './config-store';
import { t } from './i18n';
import { performQuitFlow } from './quit';
import { checkForUpdatesManual } from './updater';
import { openLocalModal, showMainWindow } from './window';

export type TAppAction =
  | 'open'
  | 'toggle-mic'
  | 'toggle-speaker'
  | 'settings'
  | 'change-server'
  | 'check-updates'
  | 'quit';

export function runAppAction(
  action: TAppAction,
  ctx: { win: BrowserWindow | null; configStore: ConfigStore },
): void {
  const { win, configStore } = ctx;

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
        win.webContents.send(EDesktopIpc.COMMAND, EDesktopCommand.TOGGLE_MIC);
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
}

export function buildActionItems(options: {
  state: TDesktopVoiceState;
  isPwaLoaded: boolean;
  locale: string;
  run: (action: TAppAction) => void;
  withAccelerators: boolean;
  hotkeys: TDesktopHotkeys;
}): Record<TAppAction, MenuItemConstructorOptions> {
  const { state, isPwaLoaded, locale, run, withAccelerators, hotkeys } =
    options;

  const toggleMicAccelerators = withAccelerators
    ? {
        accelerator: hotkeys.toggleMic ?? undefined,
        registerAccelerator: false as const,
      }
    : {};

  const toggleSpeakerAccelerators = withAccelerators
    ? {
        accelerator: hotkeys.toggleSpeaker ?? undefined,
        registerAccelerator: false as const,
      }
    : {};

  return {
    open: {
      label: t('tray.open', locale),
      click: () => run('open'),
    },
    'toggle-mic': {
      label: t('tray.muteMic', locale),
      type: 'checkbox',
      checked: state.micMuted,
      enabled: isPwaLoaded,
      click: () => run('toggle-mic'),
      ...toggleMicAccelerators,
    },
    'toggle-speaker': {
      label: t('tray.deafen', locale),
      type: 'checkbox',
      checked: state.speakerMuted,
      enabled: isPwaLoaded,
      click: () => run('toggle-speaker'),
      ...toggleSpeakerAccelerators,
    },
    settings: {
      label: t('tray.settings', locale),
      click: () => run('settings'),
    },
    'change-server': {
      label: t('tray.changeServer', locale),
      click: () => run('change-server'),
    },
    'check-updates': {
      label: t('tray.checkUpdates', locale),
      click: () => run('check-updates'),
    },
    quit: {
      label: t('tray.quit', locale),
      click: () => run('quit'),
    },
  };
}
