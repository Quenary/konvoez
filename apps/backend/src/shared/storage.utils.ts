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

/**
 * Returns the default SQLite database path.
 * In containerized environments with `/konvoez_data`, defaults to `/konvoez_data/konvoez.sqlite`.
 * In local dev without `/konvoez_data`, defaults to `.konvoez_data/konvoez.sqlite` relative to cwd.
 */
export function getDefaultSqliteDbPath(): string {
  return hasKonvoezDataVolume()
    ? '/konvoez_data/konvoez.sqlite'
    : path.join('.konvoez_data', 'konvoez.sqlite');
}

/**
 * Returns the default local object storage directory path.
 * In containerized environments with `/konvoez_data`, defaults to `/konvoez_data/files`.
 * In local dev without `/konvoez_data`, defaults to `.konvoez_data/files` relative to cwd.
 */
export function getDefaultLocalStoragePath(): string {
  return hasKonvoezDataVolume()
    ? '/konvoez_data/files'
    : path.join('.konvoez_data', 'files');
}
