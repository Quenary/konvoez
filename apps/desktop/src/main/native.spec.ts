import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { getNativeModule, resetNativeModuleForTests } from './native';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
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
