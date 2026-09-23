import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppService } from '../../shared/services/app.service';
import { VapidKeyStorageService } from './vapid-key-storage.service';

describe('VapidKeyStorageService', () => {
  let service: VapidKeyStorageService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-vapid-'));
    service = new VapidKeyStorageService({
      VAPID_FILE_DIR: tempDir,
      MASTER_KEY: 'test-master-key',
    } as AppService);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should save plain JSON when MASTER_KEY is not set', () => {
    const plainService = new VapidKeyStorageService({
      VAPID_FILE_DIR: tempDir,
      MASTER_KEY: null,
    } as AppService);
    const keys = { publicKey: 'plain-public', privateKey: 'plain-private' };

    plainService.saveVapidKeysToDisk(keys);

    const raw = fs.readFileSync(path.join(tempDir, 'vapid.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(keys);
  });

  it('should save encrypted content when MASTER_KEY is set', () => {
    const keys = {
      publicKey: 'encrypted-public',
      privateKey: 'encrypted-private',
    };

    service.saveVapidKeysToDisk(keys);

    const raw = fs.readFileSync(path.join(tempDir, 'vapid.json'), 'utf8');
    expect(raw).not.toBe(JSON.stringify(keys));
    expect(service.readVapidKeysFromDisk()).toEqual(keys);
  });

  it('should read plain JSON from disk', () => {
    const keys = { publicKey: 'plain-public', privateKey: 'plain-private' };
    fs.writeFileSync(
      path.join(tempDir, 'vapid.json'),
      JSON.stringify(keys),
      'utf8',
    );

    expect(service.readVapidKeysFromDisk()).toEqual(keys);
  });

  it('should return null for encrypted keys when MASTER_KEY is missing', () => {
    const keys = { publicKey: 'enc-public', privateKey: 'enc-private' };
    service.saveVapidKeysToDisk(keys);

    const plainService = new VapidKeyStorageService({
      VAPID_FILE_DIR: tempDir,
      MASTER_KEY: null,
    } as AppService);

    expect(plainService.readVapidKeysFromDisk()).toBeNull();
  });

  it('should return null when MASTER_KEY does not match', () => {
    const keys = { publicKey: 'enc-public', privateKey: 'enc-private' };
    service.saveVapidKeysToDisk(keys);

    const otherService = new VapidKeyStorageService({
      VAPID_FILE_DIR: tempDir,
      MASTER_KEY: 'another-master-key',
    } as AppService);

    expect(otherService.readVapidKeysFromDisk()).toBeNull();
  });
});
