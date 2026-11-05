import * as path from 'node:path';
import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron';
import { getIconPath } from './assets';
import type { ConfigStore } from './config-store';
import { isQuitting } from './quit';
import { getNativeModule } from './native';

let mainWindow: BrowserWindow | null = null;
let hasTray = true;

export function setHasTray(value: boolean): void {
  hasTray = value;
}

export function getAppIcon(): NativeImage | undefined {
  if (!nativeImage || typeof nativeImage.createFromPath !== 'function') {
    return undefined;
  }
  const iconPath = getIconPath();
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.error('[Icon] not found', iconPath);
    return undefined;
  }
  return image;
}

export function getLocalPagesDir(): string {
  return path.resolve(__dirname, 'pages');
}

export function getLocalPagePath(pageName: string): string {
  return path.resolve(getLocalPagesDir(), pageName, 'index.html');
}

export function showMainWindow(win?: BrowserWindow | null): void {
  const target = win ?? mainWindow;
  if (!target || target.isDestroyed()) {
    return;
  }
  if (target.isMinimized()) {
    target.restore();
  }
  if (!target.isVisible()) {
    target.show();
  }
  target.focus();
}

export function createMainWindow(configStore: ConfigStore): BrowserWindow {
  const config = configStore.get();
  const bounds = config.windowBounds;

  const win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.resolve(__dirname, 'preload/app-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: true,
      additionalArguments: [
        `--konvoez-version=${app.getVersion()}`,
        ...(getNativeModule()?.isAudioSupported()
          ? ['--konvoez-native-audio']
          : []),
      ],
    },
  });

  mainWindow = win;

  // Window bounds debounced saving
  let saveTimeout: NodeJS.Timeout | null = null;
  const saveBounds = () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMaximized() && !win.isMinimized()) {
        const currentBounds = win.getBounds();
        configStore.set({ windowBounds: currentBounds });
      }
    }, 500);
  };

  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.on('close', (e) => {
    if (!isQuitting()) {
      e.preventDefault();
      if (hasTray) {
        win.hide();
      } else {
        win.minimize();
      }
    }
  });

  win.once('ready-to-show', () => {
    const isHiddenStart = process.argv.includes('--hidden');
    if (!isHiddenStart) {
      win.show();
    }
  });

  return win;
}

export function openLocalModal(
  pageName: string,
  parentWindow?: BrowserWindow | null,
  options?: {
    width?: number;
    height?: number;
    resizable?: boolean;
    modal?: boolean;
    onClosed?: () => void;
  },
): BrowserWindow {
  const fallbackParent =
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
      ? mainWindow
      : undefined;
  const parent =
    parentWindow === null ? undefined : (parentWindow ?? fallbackParent);
  const hasParent = Boolean(parent && !parent.isDestroyed());
  const isModal = hasParent && options?.modal !== false;
  const modal = new BrowserWindow({
    width: options?.width ?? 600,
    height: options?.height ?? 500,
    parent: hasParent ? parent : undefined,
    modal: isModal,
    show: false,
    resizable: options?.resizable ?? false,
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

  modal.setMenu(null);
  modal.loadFile(getLocalPagePath(pageName));
  modal.once('ready-to-show', () => modal.show());

  if (options?.onClosed) {
    modal.once('closed', options.onClosed);
  }

  return modal;
}

export function getExistingMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}
