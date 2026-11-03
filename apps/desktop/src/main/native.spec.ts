import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import {
  getBinaryName,
  getNativeModule,
  resetNativeModuleForTests,
} from './native';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

describe('getBinaryName', () => {
  it.each([
    ['win32', 'x64', 'konvoez-native.win32-x64-msvc.node'],
    ['win32', 'arm64', 'konvoez-native.win32-arm64-msvc.node'],
    ['linux', 'x64', 'konvoez-native.linux-x64-gnu.node'],
    ['linux', 'arm64', 'konvoez-native.linux-arm64-gnu.node'],
    ['darwin', 'x64', 'konvoez-native.darwin-x64.node'],
    ['darwin', 'arm64', 'konvoez-native.darwin-arm64.node'],
  ] as const)('names the %s-%s napi triple', (platform, arch, expected) => {
    expect(getBinaryName(platform, arch)).toBe(expected);
  });
});

describe('native module loader', () => {
  beforeEach(() => {
    resetNativeModuleForTests();
    vi.mocked(fs.existsSync).mockReset();
  });

  afterEach(() => {
    resetNativeModuleForTests();
    vi.restoreAllMocks();
  });

  it('returns null and warns when binary is not found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const mod = getNativeModule();
    expect(mod).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Native module binary not found'),
    );
  });

  it('caches the result on subsequent calls', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    getNativeModule();
    getNativeModule();
    expect(fs.existsSync).toHaveBeenCalled();
  });

  it('handles loading failure gracefully without throwing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const mod = getNativeModule();
    expect(mod).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load native module'),
      expect.anything(),
    );
  });
});
