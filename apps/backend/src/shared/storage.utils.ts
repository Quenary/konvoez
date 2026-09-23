import fs from 'fs';
import path from 'path';

/**
 * Checks if the persistent docker volume directory exists.
 */
export function hasKonvoezDataVolume(): boolean {
  try {
    return fs.existsSync('/konvoez_data');
  } catch {
    return false;
  }
}

export function getDefaultDataDir(): string {
  if (
    !fs.existsSync('.konvoez_data') &&
    fs.existsSync(path.join('..', '..', '.konvoez_data'))
  ) {
    return path.join('..', '..', '.konvoez_data');
  }
  return '.konvoez_data';
}

/**
 * Returns the default SQLite database path.
 * In containerized environments with `/konvoez_data`, defaults to `/konvoez_data/konvoez.sqlite`.
 * In local dev without `/konvoez_data`, defaults to `.konvoez_data/konvoez.sqlite` relative to cwd,
 * or `../../.konvoez_data/konvoez.sqlite` if running from `apps/backend`.
 */
export function getDefaultSqliteDbPath(): string {
  if (hasKonvoezDataVolume()) {
    return '/konvoez_data/konvoez.sqlite';
  }
  return path.join(getDefaultDataDir(), 'konvoez.sqlite');
}

/**
 * Returns the default local object storage directory path.
 * In containerized environments with `/konvoez_data`, defaults to `/konvoez_data/files`.
 * In local dev without `/konvoez_data`, defaults to `.konvoez_data/files` relative to cwd,
 * or `../../.konvoez_data/files` if running from `apps/backend`.
 */
export function getDefaultLocalStoragePath(): string {
  if (hasKonvoezDataVolume()) {
    return '/konvoez_data/files';
  }
  return path.join(getDefaultDataDir(), 'files');
}
