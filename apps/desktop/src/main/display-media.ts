import * as path from 'node:path';
import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  MessageChannelMain,
  type DesktopCapturerSource,
  type Session,
} from 'electron';
import { EDesktopIpc } from '@konvoez/shared';
import type { ISerializableSource } from '@konvoez/client-shell';
import type { ConfigStore } from './config-store';
import { getAppIcon, getLocalPagePath } from './window';
import {
  getNativeModule,
  type AudioCaptureHandle,
  type AudioCaptureOptions,
} from './native';

let activeAudioCapture: AudioCaptureHandle | null = null;

export interface IPickedSourceResult {
  source: DesktopCapturerSource | null;
  withAudio: boolean;
  audioStreamId?: string;
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
  if (activeAudioCapture) {
    try {
      activeAudioCapture.stop();
    } catch {
      // ignore
    }
    activeAudioCapture = null;
  }
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
      audioStreamId?: string,
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
        resolve({ source: found, withAudio, audioStreamId });
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

    ipcMain.handle(EDesktopIpc.LOCAL_PICKER_SOURCES, () => {
      const nativeMod = getNativeModule();
      let audioStreams;
      try {
        audioStreams = nativeMod?.getAudioStreams?.();
      } catch {
        // ignore
      }
      return {
        sources: serializable,
        audioStreams:
          audioStreams && audioStreams.length > 0 ? audioStreams : undefined,
      };
    });
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
        let audioStreamId: string | undefined;

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
          audioStreamId = picked.audioStreamId;
        }

        if (!pickedSource) {
          callback(null);
          return;
        }

        const response: { video: DesktopCapturerSource; audio?: 'loopback' } = {
          video: pickedSource,
        };

        const nativeMod = getNativeModule();
        const hasNativeAudio = nativeMod?.isAudioSupported() ?? false;
        const isKonvoezWindow =
          pickedSource.id.startsWith('window:') &&
          pickedSource.name === 'Konvoez';
        let nativeStarted = false;

        if (
          request.audioRequested &&
          withAudio &&
          hasNativeAudio &&
          nativeMod &&
          !isKonvoezWindow
        ) {
          if (activeAudioCapture) {
            try {
              activeAudioCapture.stop();
            } catch {
              // ignore
            }
            activeAudioCapture = null;
          }

          const { port1, port2 } = new MessageChannelMain();
          const hwndMatch = pickedSource.id.match(/^window:(\d+)/);
          const hwnd = hwndMatch ? Number(hwndMatch[1]) : undefined;
          const isScreen = pickedSource.id.startsWith('screen:');

          const captureOptions: AudioCaptureOptions = audioStreamId
            ? { mode: 'include', targetStreamId: audioStreamId }
            : isScreen || platform === 'linux'
              ? { mode: 'exclude', targetPid: process.pid }
              : { mode: 'include', targetHwnd: hwnd };

          try {
            const handle = nativeMod.startAudioCapture(
              captureOptions,
              (chunk: Buffer) => {
                try {
                  const arrayBuffer =
                    chunk.byteOffset === 0 &&
                    chunk.byteLength === chunk.buffer.byteLength
                      ? chunk.buffer
                      : chunk.buffer.slice(
                          chunk.byteOffset,
                          chunk.byteOffset + chunk.byteLength,
                        );
                  port1.postMessage(arrayBuffer);
                } catch {
                  // port may be closed
                }
              },
            );
            activeAudioCapture = handle;

            const cleanupCapture = () => {
              try {
                handle.stop();
              } catch {
                // ignore
              }
              if (activeAudioCapture === handle) {
                activeAudioCapture = null;
              }
              try {
                port1.close();
              } catch {
                // ignore
              }
            };

            port1.on('message', (event) => {
              if (event.data === 'stop') {
                cleanupCapture();
              }
            });
            port1.on('close', () => {
              cleanupCapture();
            });
            port1.start();

            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.postMessage(EDesktopIpc.SCREEN_AUDIO_PORT, null, [
                port2,
              ]);
            }
            nativeStarted = true;
            reuseVideoSourceId = pickedSource.id;
          } catch (err) {
            console.warn(
              '[DisplayMedia] Failed to start native audio capture:',
              err,
            );
            try {
              port1.close();
            } catch {
              // ignore
            }
          }
        }

        if (!nativeStarted && hasNativeAudio && request.audioRequested) {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.postMessage(EDesktopIpc.SCREEN_AUDIO_PORT, null);
          }
        }

        if (!nativeStarted && !isKonvoezWindow) {
          const audio =
            request.audioRequested && withAudio
              ? getScreenShareAudio(platform)
              : undefined;

          if (audio) {
            response.audio = audio;
            reuseVideoSourceId = pickedSource.id;
          }
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
