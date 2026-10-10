import {
  EDesktopIpc,
  desktopHotkeysSchema,
  desktopNotificationSchema,
  desktopVoiceStateSchema,
  type TDesktopHotkeys,
  type TDesktopVoiceState,
  type TPushNotificationPayload,
} from '@konvoez/shared';
import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import type { ConfigStore } from './config-store';
import { normalizeServerOrigin, probeServer } from './server-url';
import { showNotification } from './notifications';
import { setVoiceState } from './tray';
import { applyHotkeys } from './hotkeys';
import { setAutostart } from './autostart';
import { notifyQuitReady } from './quit';
import { resolveLanguage } from './i18n';
import { showMainWindow } from './window';

export function isTrustedAppSender(
  frameUrl: string | undefined,
  serverOrigin: string | null,
): boolean {
  if (!frameUrl || !serverOrigin) {
    return false;
  }
  try {
    const url = new URL(frameUrl);
    return url.origin === serverOrigin;
  } catch {
    return false;
  }
}

export function isTrustedLocalSender(frameUrl: string | undefined): boolean {
  if (!frameUrl) {
    return false;
  }
  try {
    const url = new URL(frameUrl);
    return url.protocol === 'file:';
  } catch {
    return false;
  }
}

function validateAppSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  configStore: ConfigStore,
): boolean {
  if (event.senderFrame !== event.sender.mainFrame) {
    console.warn('[IPC] Message rejected: sender is not mainFrame');
    return false;
  }
  const trusted = isTrustedAppSender(
    event.senderFrame?.url,
    configStore.get().serverOrigin,
  );
  if (!trusted) {
    console.warn(
      `[IPC] Message rejected: untrusted origin ${event.senderFrame?.url}`,
    );
  }
  return trusted;
}

function validateLocalSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
): boolean {
  if (event.senderFrame !== event.sender.mainFrame) {
    console.warn('[IPC] Local message rejected: sender is not mainFrame');
    return false;
  }
  const trusted = isTrustedLocalSender(event.senderFrame?.url);
  if (!trusted) {
    console.warn(
      `[IPC] Local message rejected: untrusted url ${event.senderFrame?.url}`,
    );
  }
  return trusted;
}

export function registerIpc(
  configStore: ConfigStore,
  getMainWindow: () => BrowserWindow | null,
): void {
  // App communication channels
  ipcMain.on(EDesktopIpc.NOTIFY, (event: IpcMainEvent, rawPayload: unknown) => {
    if (!validateAppSender(event, configStore)) {
      return;
    }
    const parsed = desktopNotificationSchema.safeParse(rawPayload);
    if (!parsed.success) {
      console.warn('[IPC] Invalid notify payload:', parsed.error);
      return;
    }
    const win = getMainWindow();
    if (win) {
      showNotification(parsed.data as TPushNotificationPayload, win);
    }
  });

  ipcMain.on(
    EDesktopIpc.SET_VOICE_STATE,
    (event: IpcMainEvent, rawState: unknown) => {
      if (!validateAppSender(event, configStore)) {
        return;
      }
      const parsed = desktopVoiceStateSchema.safeParse(rawState);
      if (!parsed.success) {
        console.warn('[IPC] Invalid voice state payload:', parsed.error);
        return;
      }
      setVoiceState(parsed.data as TDesktopVoiceState);
    },
  );

  ipcMain.on(EDesktopIpc.QUIT_READY, (event: IpcMainEvent) => {
    if (!validateAppSender(event, configStore)) {
      return;
    }
    notifyQuitReady();
  });

  // Local pages channels
  ipcMain.handle(EDesktopIpc.LOCAL_GET_CONFIG, (event: IpcMainInvokeEvent) => {
    if (!validateLocalSender(event)) {
      throw new Error('UNAUTHORIZED');
    }
    const config = configStore.get();
    return {
      serverOrigin: config.serverOrigin,
      hotkeys: config.hotkeys,
      autostart: config.autostart,
      locale: resolveLanguage(app.getLocale()),
    };
  });

  ipcMain.handle(
    EDesktopIpc.LOCAL_TEST_SERVER,
    async (event: IpcMainInvokeEvent, rawUrl: unknown) => {
      if (!validateLocalSender(event)) {
        throw new Error('UNAUTHORIZED');
      }
      if (typeof rawUrl !== 'string') {
        throw new Error('INVALID_URL');
      }
      const origin = normalizeServerOrigin(rawUrl);
      const { version } = await probeServer(origin);
      return { origin, version };
    },
  );

  ipcMain.handle(
    EDesktopIpc.LOCAL_SAVE_SERVER,
    async (event: IpcMainInvokeEvent, rawUrl: unknown) => {
      if (!validateLocalSender(event)) {
        throw new Error('UNAUTHORIZED');
      }
      if (typeof rawUrl !== 'string') {
        throw new Error('INVALID_URL');
      }
      const origin = normalizeServerOrigin(rawUrl);
      await probeServer(origin);
      configStore.set({ serverOrigin: origin });
      const win = getMainWindow();
      if (win) {
        void win.loadURL(origin);
        showMainWindow(win);
      }
      BrowserWindow.fromWebContents(event.sender)?.close();
      return { success: true, origin };
    },
  );

  ipcMain.handle(
    EDesktopIpc.LOCAL_SAVE_SETTINGS,
    (
      event: IpcMainInvokeEvent,
      params: { hotkeys?: unknown; autostart?: unknown },
    ) => {
      if (!validateLocalSender(event)) {
        throw new Error('UNAUTHORIZED');
      }
      const hotkeysParsed = desktopHotkeysSchema.safeParse(params.hotkeys);
      if (!hotkeysParsed.success) {
        throw new Error('INVALID_HOTKEYS');
      }
      const autostart = Boolean(params.autostart);

      const hotkeyStatuses = applyHotkeys(
        hotkeysParsed.data as TDesktopHotkeys,
      );
      setAutostart(autostart);
      configStore.set({
        hotkeys: hotkeysParsed.data as TDesktopHotkeys,
        autostart,
      });

      return {
        success: true,
        hotkeys: hotkeyStatuses,
        autostart,
      };
    },
  );
}
