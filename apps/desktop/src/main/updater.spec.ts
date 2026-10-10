import { describe, expect, it } from 'vitest';
import { shouldCheckForUpdates } from './updater';

describe('shouldCheckForUpdates', () => {
  it('returns false in unpackaged development mode', () => {
    expect(
      shouldCheckForUpdates({
        isPackaged: false,
        platform: 'win32',
      }),
    ).toBe(false);

    expect(
      shouldCheckForUpdates({
        isPackaged: false,
        platform: 'linux',
        appImageEnv: '/path/to/app.AppImage',
      }),
    ).toBe(false);
  });

  it('returns false on Linux when APPIMAGE env is not present', () => {
    expect(
      shouldCheckForUpdates({
        isPackaged: true,
        platform: 'linux',
        appImageEnv: undefined,
      }),
    ).toBe(false);
  });

  it('returns true on Linux when packaged with APPIMAGE', () => {
    expect(
      shouldCheckForUpdates({
        isPackaged: true,
        platform: 'linux',
        appImageEnv: '/home/user/Konvoez.AppImage',
      }),
    ).toBe(true);
  });

  it('returns true on Windows when packaged', () => {
    expect(
      shouldCheckForUpdates({
        isPackaged: true,
        platform: 'win32',
      }),
    ).toBe(true);
  });
});
