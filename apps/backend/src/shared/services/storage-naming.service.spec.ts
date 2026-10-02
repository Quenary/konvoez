import { AppService } from './app.service';
import { StorageNamingService } from './storage-naming.service';
import {
  assertObjectStoragePrefix,
  resolvePhysicalBucket,
  toPhysicalRelativePath,
} from './storage-naming';

describe('storage naming', () => {
  it('maps an empty prefix to the logical bucket', () => {
    expect(resolvePhysicalBucket('users-avatars', '')).toBe('users-avatars');
    expect(toPhysicalRelativePath('users-avatars/file.webp', '')).toBe(
      'users-avatars/file.webp',
    );
  });

  it('prefixes both the bucket and the local directory', () => {
    expect(resolvePhysicalBucket('users-avatars', 'acme')).toBe(
      'acme-users-avatars',
    );
    expect(toPhysicalRelativePath('users-avatars/file.webp', 'acme')).toBe(
      'acme-users-avatars/file.webp',
    );
  });

  it('rejects invalid prefixes', () => {
    expect(() => assertObjectStoragePrefix('Acme')).toThrow(
      /OBJECT_STORAGE_PREFIX/,
    );
    expect(() => assertObjectStoragePrefix('acme.prod')).toThrow(
      /OBJECT_STORAGE_PREFIX/,
    );
    expect(() => assertObjectStoragePrefix('a'.repeat(43))).toThrow(
      /OBJECT_STORAGE_PREFIX/,
    );
    expect(() => assertObjectStoragePrefix('-acme')).toThrow(
      /OBJECT_STORAGE_PREFIX/,
    );
  });

  it('reads the prefix from AppService', () => {
    const appService = {
      OBJECT_STORAGE_PREFIX: 'acme',
    } as unknown as AppService;
    const service = new StorageNamingService(appService);
    expect(service.resolvePhysicalBucket('message-attachments')).toBe(
      'acme-message-attachments',
    );
  });
});
