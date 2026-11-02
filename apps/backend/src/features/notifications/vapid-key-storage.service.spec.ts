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

  it('throws when saving without MASTER_KEY', () => {
    const plainService = new VapidKeyStorageService({
      VAPID_FILE_DIR: tempDir,
      MASTER_KEY: null,
    } as AppService);

    expect(() =>
      plainService.saveVapidKeysToDisk({
        publicKey: 'plain-public',
        privateKey: 'plain-private',
      }),
    ).toThrow(/MASTER_KEY is not configured/);
  });

  it('should save encrypted content when MASTER_KEY is set', () => {
    const keys = {
      publicKey: 'encrypted-public',
      privateKey: 'encrypted-private',
    };

    service.saveVapidKeysToDisk(keys);

    const raw = fs.readFileSync(path.join(tempDir, 'vapid.json'), 'utf8');
    expect(raw.startsWith('v1:')).toBe(true);
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

  it('replaces vapid.json with the staged file when only that file can be read', () => {
    const keys = { publicKey: 'staged-public', privateKey: 'staged-private' };
    service.saveVapidKeysToDisk(keys);
    const filePath = path.join(tempDir, 'vapid.json');
    fs.renameSync(filePath, `${filePath}.rotate`);
    fs.writeFileSync(filePath, 'v1:not-a-secret-box', 'utf8');

    service.assertCanGenerateVapidKeys();

    expect(fs.existsSync(`${filePath}.rotate`)).toBe(false);
    expect(service.readVapidKeysFromDisk()).toEqual(keys);
  });

  it('leaves the staged file in place when vapid.json can be read', () => {
    const keys = { publicKey: 'kept-public', privateKey: 'kept-private' };
    service.saveVapidKeysToDisk(keys);
    const filePath = path.join(tempDir, 'vapid.json');
    const current = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(`${filePath}.rotate`, 'pending', 'utf8');

    service.assertCanGenerateVapidKeys();

    expect(fs.readFileSync(`${filePath}.rotate`, 'utf8')).toBe('pending');
    expect(fs.readFileSync(filePath, 'utf8')).toBe(current);
    expect(service.readVapidKeysFromDisk()).toEqual(keys);
  });

  it('does not replace vapid.json when neither file can be read', () => {
    const filePath = path.join(tempDir, 'vapid.json');
    fs.writeFileSync(filePath, 'v1:not-a-secret-box', 'utf8');
    fs.writeFileSync(`${filePath}.rotate`, 'also-unreadable', 'utf8');

    expect(() => service.assertCanGenerateVapidKeys()).toThrow(/neither file/);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('v1:not-a-secret-box');
    expect(fs.readFileSync(`${filePath}.rotate`, 'utf8')).toBe(
      'also-unreadable',
    );
  });

  it('does not replace vapid.json when the file cannot be read', () => {
    const filePath = path.join(tempDir, 'vapid.json');
    fs.writeFileSync(filePath, 'v1:not-a-secret-box', 'utf8');

    expect(() => service.assertCanGenerateVapidKeys()).toThrow(
      /cannot be read/,
    );
    expect(() =>
      service.saveVapidKeysToDisk({
        publicKey: 'new-public',
        privateKey: 'new-private',
      }),
    ).toThrow(/cannot be read/);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('v1:not-a-secret-box');
  });
});
