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
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnailUrl: source.thumbnail.toDataURL(),
    appIconUrl: source.appIcon ? source.appIcon.toDataURL() : null,
  }));
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

    const cleanup = () => {
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
          preload: `${__dirname}/preload/local-preload.js`,
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
    pickerWin.loadFile(getLocalPagePath('picker'));

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
  });
}

export function installDisplayMediaHandler(
  sess: Session,
  getServerOrigin: () => string | null,
  getMainWindow: () => BrowserWindow | null,
): void {
  sess.setDisplayMediaRequestHandler(
    async (request, callback) => {
      const serverOrigin = getServerOrigin();
      if (!serverOrigin || request.securityOrigin !== serverOrigin) {
        callback({});
        return;
      }

      if (pickerOpen) {
        callback({});
        return;
      }

      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });

        const audio = getScreenShareAudio();

        if (sources.length === 1) {
          callback({ video: sources[0], audio });
          return;
        }

        const picked = await openSourcePicker(sources, getMainWindow());
        if (!picked) {
          callback({});
          return;
        }

        callback({ video: picked, audio });
      } catch (err) {
        console.error('[DisplayMedia] Error capturing sources:', err);
        callback({});
      }
    },
    { useSystemPicker: false },
  );
}
