import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AudioStreamInfo {
  id: string;
  name: string;
  pid?: number;
}

export interface AudioCaptureOptions {
  mode: 'exclude' | 'include';
  targetPid?: number;
  targetStreamId?: string;
}

export interface AudioCaptureHandle {
  stop(): void;
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
    callback: (event: { code: string; down: boolean }) => void,
  ): KeyHookHandle;
}

function getBinaryName(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'win32' && arch === 'x64') {
    return 'konvoez-native.win32-x64-msvc.node';
  }
  if (platform === 'linux' && arch === 'x64') {
    return 'konvoez-native.linux-x64-gnu.node';
  }
  return `konvoez-native.${platform}-${arch}.node`;
}

function resolveNativeBinaryPath(): string | null {
  const binaryName = getBinaryName();
  const candidateNames = [binaryName, 'konvoez-native.node'];

  const candidateDirs: string[] = [
    path.resolve(__dirname, 'native'),
    path.resolve(__dirname, '..', 'native'),
    path.resolve(process.cwd(), 'dist', 'native'),
    path.resolve(process.cwd(), 'libs', 'desktop-native'),
  ];

  const resourcesPath = (process as unknown as { resourcesPath?: string })
    .resourcesPath;
  if (resourcesPath) {
    candidateDirs.unshift(
      path.resolve(resourcesPath, 'app.asar.unpacked', 'dist', 'native'),
      path.resolve(resourcesPath, 'app.asar.unpacked', 'native'),
    );
  }

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
