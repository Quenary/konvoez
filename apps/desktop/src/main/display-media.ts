import * as path from 'node:path';
import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  type DesktopCapturerSource,
  type Session,
} from 'electron';
import { EDesktopIpc } from '@konvoez/shared';
import type { ISerializableSource } from '@konvoez/client-shell';
import type { ConfigStore } from './config-store';
import { getAppIcon, getLocalPagePath } from './window';

export interface IPickedSourceResult {
  source: DesktopCapturerSource | null;
  withAudio: boolean;
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

/** Reuse last video source when the renderer retries getDisplayMedia without audio. */
let reuseVideoSourceId: string | null = null;

/** Suppress a follow-up audio:false retry right after the user dismissed the picker. */
let displayMediaCancelledAt = 0;

const DISPLAY_MEDIA_CANCEL_SUPPRESS_MS = 10_000;

function markDisplayMediaCancelled(): void {
  displayMediaCancelledAt = Date.now();
}

function shouldSuppressAudioFallbackRetry(): boolean {
  if (!displayMediaCancelledAt) {
    return false;
  }
  if (Date.now() - displayMediaCancelledAt > DISPLAY_MEDIA_CANCEL_SUPPRESS_MS) {
    displayMediaCancelledAt = 0;
    return false;
  }
  displayMediaCancelledAt = 0;
  return true;
}

export function isPickerOpen(): boolean {
  return pickerOpen;
}

export function resetPickerOpenForTests(): void {
  pickerOpen = false;
  reuseVideoSourceId = null;
  displayMediaCancelledAt = 0;
}

export async function openSourcePicker(
  sources: DesktopCapturerSource[],
  parentWindow?: BrowserWindow | null,
  configStore?: ConfigStore | null,
): Promise<IPickedSourceResult | null> {
  if (pickerOpen) {
    return null;
  }
  pickerOpen = true;
  const serializable = serializeCapturerSources(sources);

  return new Promise((resolve) => {
    let resolved = false;

    let pickerWin: BrowserWindow;

    const handlePick = (
      _: unknown,
      pickedId: string | null,
      withAudio = configStore?.get().shareAudio ?? true,
    ) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        if (pickerWin && !pickerWin.isDestroyed()) {
          pickerWin.close();
        }
        const found = sources.find((s) => s.id === pickedId) ?? null;
        if (!found) {
          markDisplayMediaCancelled();
        }
        if (configStore) {
          configStore.set({ shareAudio: withAudio });
        }
        resolve({ source: found, withAudio });
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
        height: 560,
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
        markDisplayMediaCancelled();
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
  configStore?: ConfigStore | null,
  platform: NodeJS.Platform = process.platform,
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

      if (request.audioRequested) {
        reuseVideoSourceId = null;
        displayMediaCancelledAt = 0;
      }

      if (!request.audioRequested && shouldSuppressAudioFallbackRetry()) {
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

        if (!request.audioRequested && reuseVideoSourceId) {
          const reuseId = reuseVideoSourceId;
          reuseVideoSourceId = null;
          const reused = sources.find((source) => source.id === reuseId);
          if (reused) {
            callback({ video: reused });
            return;
          }
        }

        let pickedSource: DesktopCapturerSource | null = null;
        let withAudio = configStore ? configStore.get().shareAudio : true;

        if (sources.length === 1) {
          pickedSource = sources[0];
        } else {
          const picked = await openSourcePicker(
            sources,
            getMainWindow(),
            configStore,
          );

          if (!picked || !picked.source) {
            callback(null);
            return;
          }
          pickedSource = picked.source;
          withAudio = picked.withAudio;
        }

        if (!pickedSource) {
          callback(null);
          return;
        }

        const audio =
          request.audioRequested && withAudio
            ? getScreenShareAudio(platform)
            : undefined;

        const response: { video: DesktopCapturerSource; audio?: 'loopback' } = {
          video: pickedSource,
        };
        if (audio) {
          response.audio = audio;
          reuseVideoSourceId = pickedSource.id;
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
