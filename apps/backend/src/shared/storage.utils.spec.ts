import fs from 'fs';
import path from 'path';
import {
  getDefaultLocalStoragePath,
  getDefaultSqliteDbPath,
  hasKonvoezDataVolume,
} from './storage.utils';

jest.mock('fs');

describe('storage.utils', () => {
  const mockedExistsSync = jest.mocked(fs.existsSync);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when /konvoez_data volume exists', () => {
    beforeEach(() => {
      mockedExistsSync.mockReturnValue(true);
    });

    it('hasKonvoezDataVolume should return true', () => {
      expect(hasKonvoezDataVolume()).toBe(true);
    });

    it('getDefaultSqliteDbPath should return /konvoez_data/konvoez.sqlite', () => {
      expect(getDefaultSqliteDbPath()).toBe('/konvoez_data/konvoez.sqlite');
    });

    it('getDefaultLocalStoragePath should return /konvoez_data/files', () => {
      expect(getDefaultLocalStoragePath()).toBe('/konvoez_data/files');
    });
  });

  describe('when /konvoez_data volume does NOT exist', () => {
    beforeEach(() => {
      mockedExistsSync.mockReturnValue(false);
    });

    it('hasKonvoezDataVolume should return false', () => {
      expect(hasKonvoezDataVolume()).toBe(false);
    });

    it('getDefaultSqliteDbPath should return .konvoez_data/konvoez.sqlite', () => {
      expect(getDefaultSqliteDbPath()).toBe(
        path.join('.konvoez_data', 'konvoez.sqlite'),
      );
    });

    it('getDefaultLocalStoragePath should return .konvoez_data/files', () => {
      expect(getDefaultLocalStoragePath()).toBe(
        path.join('.konvoez_data', 'files'),
      );
    });
  });
});
