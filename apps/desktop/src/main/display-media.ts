import * as path from 'node:path';
import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  type DesktopCapturerSource,
  type Session,
} from 'electron';
import { EDesktopIpc } from '@konvoez/shared';
import { getAppIcon, getLocalPagePath } from './window';

export interface ISerializableSource {
  id: string;
  name: string;
  thumbnailUrl: string;
  appIconUrl: string | null;
}

export function getScreenShareAudio(
  platform: NodeJS.Platform = process.platform,
): 'loopback' | undefined {
  return platform === 'win32' ? 'loopback' : undefined;
}

export function serializeCapturerSources(
  sources: DesktopCapturerSource[],
): ISerializableSource[] {
  return sources.map((source) => {
    let thumbnailUrl = '';
    try {
      thumbnailUrl = source.thumbnail ? source.thumbnail.toDataURL() : '';
    } catch {
      // fallback to empty if thumbnail conversion fails
    }
    let appIconUrl: string | null = null;
    try {
      appIconUrl = source.appIcon ? source.appIcon.toDataURL() : null;
    } catch {
      // fallback to null if icon conversion fails
    }
    return {
      id: source.id,
      name: source.name,
      thumbnailUrl,
      appIconUrl,
    };
  });
}

let pickerOpen = false;

export function isPickerOpen(): boolean {
  return pickerOpen;
}

export function resetPickerOpenForTests(): void {
  pickerOpen = false;
}

export async function openSourcePicker(
  sources: DesktopCapturerSource[],
  parentWindow?: BrowserWindow | null,
): Promise<DesktopCapturerSource | null> {
  if (pickerOpen) {
    return null;
  }
  pickerOpen = true;
  const serializable = serializeCapturerSources(sources);

  return new Promise((resolve) => {
    let resolved = false;

    let pickerWin: BrowserWindow;

    const handlePick = (_: unknown, pickedId: string | null) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        if (pickerWin && !pickerWin.isDestroyed()) {
          pickerWin.close();
        }
        const found = sources.find((s) => s.id === pickedId) ?? null;
        resolve(found);
      }
    };

    let showFallbackTimeout: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (showFallbackTimeout) {
        clearTimeout(showFallbackTimeout);
        showFallbackTimeout = undefined;
      }
      pickerOpen = false;
      ipcMain.removeHandler(EDesktopIpc.LOCAL_PICKER_SOURCES);
      ipcMain.removeListener(EDesktopIpc.LOCAL_PICK_SOURCE, handlePick);
    };

    try {
      pickerWin = new BrowserWindow({
        width: 720,
        height: 520,
        parent:
          parentWindow && !parentWindow.isDestroyed()
            ? parentWindow
            : undefined,
        modal: Boolean(parentWindow && !parentWindow.isDestroyed()),
        show: false,
        resizable: true,
        icon: getAppIcon(),
        webPreferences: {
          preload: path.resolve(__dirname, 'preload/local-preload.js'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true,
          spellcheck: false,
        },
      });
    } catch {
      cleanup();
      resolve(null);
      return;
    }

    pickerWin.setMenu(null);
    void pickerWin.loadFile(getLocalPagePath('picker'));

    ipcMain.handle(EDesktopIpc.LOCAL_PICKER_SOURCES, () => serializable);
    ipcMain.once(EDesktopIpc.LOCAL_PICK_SOURCE, handlePick);

    pickerWin.on('closed', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    });

    pickerWin.once('ready-to-show', () => pickerWin.show());
    showFallbackTimeout = setTimeout(() => {
      if (pickerWin && !pickerWin.isDestroyed() && !pickerWin.isVisible()) {
        pickerWin.show();
      }
    }, 1000);
    pickerWin.once('show', () => {
      if (showFallbackTimeout) {
        clearTimeout(showFallbackTimeout);
        showFallbackTimeout = undefined;
      }
    });
  });
}

function safeOrigin(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

export function installDisplayMediaHandler(
  sess: Session,
  getServerOrigin: () => string | null,
  getMainWindow: () => BrowserWindow | null,
): void {
  sess.setDisplayMediaRequestHandler(
    async (request, callback) => {
      const serverOrigin = getServerOrigin();
      const requestOrigin = safeOrigin(request.securityOrigin);
      const normalizedServerOrigin = safeOrigin(serverOrigin);

      if (
        !normalizedServerOrigin ||
        !requestOrigin ||
        requestOrigin !== normalizedServerOrigin
      ) {
        console.warn(
          `[DisplayMedia] Origin mismatch: request=${request.securityOrigin} (${requestOrigin}), server=${serverOrigin} (${normalizedServerOrigin})`,
        );
        callback(null);
        return;
      }

      if (pickerOpen) {
        callback(null);
        return;
      }

      try {
        let sources: DesktopCapturerSource[] = [];
        try {
          sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: true,
          });
        } catch (iconErr) {
          console.warn(
            '[DisplayMedia] getSources with icons failed, retrying without icons:',
            iconErr,
          );
          sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: false,
          });
        }

        if (sources.length === 0) {
          console.warn('[DisplayMedia] No capturable sources found');
          callback(null);
          return;
        }

        const picked =
          sources.length === 1
            ? sources[0]
            : await openSourcePicker(sources, getMainWindow());

        if (!picked) {
          callback(null);
          return;
        }

        const isScreen = picked.id.startsWith('screen:');
        const audio =
          request.audioRequested && isScreen
            ? getScreenShareAudio()
            : undefined;

        const response: { video: DesktopCapturerSource; audio?: 'loopback' } = {
          video: picked,
        };
        if (audio) {
          response.audio = audio;
        }

        callback(response);
      } catch (err) {
        console.error('[DisplayMedia] Error capturing sources:', err);
        callback(null);
      }
    },
    { useSystemPicker: false },
  );
}
