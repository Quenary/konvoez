import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';

export interface AudioStreamInfo {
  id: string;
  name: string;
  pid?: number;
}

export interface AudioCaptureOptions {
  mode: 'exclude' | 'include';
  targetPid?: number;
  targetHwnd?: number;
  targetStreamId?: string;
}

export interface AudioCaptureHandle {
  stop(): void;
  mode(): 'include' | 'exclude';
}

export interface KeyHookHandle {
  stop(): void;
}

export interface INativeModule {
  isAudioSupported(): boolean;
  isKeyHookSupported(): boolean;
  getAudioStreams(): AudioStreamInfo[];
  startAudioCapture(
    options: AudioCaptureOptions,
    callback: (chunk: Buffer) => void,
  ): AudioCaptureHandle;
  startKeyHook(
    callback: (event: {
      code: string;
      down: boolean;
      repeat?: boolean;
    }) => void,
  ): KeyHookHandle;
}

export function getBinaryName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  if (platform === 'win32' && arch === 'x64') {
    return 'konvoez-native.win32-x64-msvc.node';
  }
  if (platform === 'win32' && arch === 'arm64') {
    return 'konvoez-native.win32-arm64-msvc.node';
  }
  if (platform === 'linux' && arch === 'x64') {
    return 'konvoez-native.linux-x64-gnu.node';
  }
  if (platform === 'linux' && arch === 'arm64') {
    return 'konvoez-native.linux-arm64-gnu.node';
  }
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
    return `konvoez-native.darwin-${arch}.node`;
  }
  return `konvoez-native.${platform}-${arch}.node`;
}

export interface INativeSearchContext {
  isPackaged: boolean;
  dirname: string;
  cwd: string;
  resourcesPath?: string;
}

/**
 * Directories searched for the addon. A packaged app never looks relative to
 * the working directory, so a `.node` there cannot be loaded into the main process.
 */
export function getNativeSearchDirs(context: INativeSearchContext): string[] {
  const dirs = [
    path.resolve(context.dirname, 'native'),
    path.resolve(context.dirname, '..', 'native'),
  ];
  if (context.resourcesPath) {
    dirs.unshift(
      path.resolve(
        context.resourcesPath,
        'app.asar.unpacked',
        'dist',
        'native',
      ),
      path.resolve(context.resourcesPath, 'app.asar.unpacked', 'native'),
    );
  }
  if (!context.isPackaged) {
    dirs.push(
      path.resolve(context.cwd, 'dist', 'native'),
      path.resolve(context.cwd, 'libs', 'desktop-native'),
    );
  }
  return dirs;
}

function resolveNativeBinaryPath(): string | null {
  const binaryName = getBinaryName();
  const candidateNames = [binaryName, 'konvoez-native.node'];

  const candidateDirs = getNativeSearchDirs({
    isPackaged: app.isPackaged,
    dirname: __dirname,
    cwd: process.cwd(),
    resourcesPath: (process as unknown as { resourcesPath?: string })
      .resourcesPath,
  });

  for (const dir of candidateDirs) {
    for (const name of candidateNames) {
      const fullPath = path.resolve(dir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

let cachedNative: INativeModule | null = null;
let loadAttempted = false;

export function getNativeModule(): INativeModule | null {
  if (loadAttempted) {
    return cachedNative;
  }
  loadAttempted = true;

  const binaryPath = resolveNativeBinaryPath();
  if (!binaryPath) {
    console.warn(
      '[Native] Native module binary not found. Running with standard fallbacks.',
    );
    return null;
  }

  try {
    const mod = require(binaryPath) as INativeModule;
    cachedNative = mod;
    console.info(`[Native] Loaded native module from ${binaryPath}`);
    return mod;
  } catch (err) {
    console.warn(
      `[Native] Failed to load native module from ${binaryPath}:`,
      err,
    );
    return null;
  }
}

export function resetNativeModuleForTests(): void {
  cachedNative = null;
  loadAttempted = false;
}
