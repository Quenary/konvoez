import { BadRequestException, NotFoundException } from '@nestjs/common';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppService } from './app.service';
import { LocalObjectStorageService } from './local-object-storage.service';

describe('LocalObjectStorageService', () => {
  let service: LocalObjectStorageService;
  let tempDir: string;
  let appService: AppService;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'konvoez-test-'));
    appService = {
      LOCAL_OBJECT_STORAGE_PATH: tempDir,
    } as unknown as AppService;
    service = new LocalObjectStorageService(appService);
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should upload a file and return a key', async () => {
    const mockFile = {
      originalname: 'test-avatar.png',
      buffer: Buffer.from('fake image content'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    const key = await service.upload(mockFile, 'rooms-avatars');

    expect(key).toMatch(/^rooms-avatars\/\d+-test-avatar\.png$/);

    const savedFilePath = path.join(tempDir, key);
    expect(fs.existsSync(savedFilePath)).toBe(true);

    const content = await fs.promises.readFile(savedFilePath);
    expect(content.toString()).toBe('fake image content');
  });

  it('should retrieve a readable stream and file metadata', async () => {
    const mockFile = {
      originalname: 'user.jpg',
      buffer: Buffer.from('user-avatar-data'),
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    const key = await service.upload(mockFile, 'users-avatars');

    const result = await service.getStream(key);

    expect(result.contentType).toBe('image/jpeg');
    expect(result.contentLength).toBe(Buffer.from('user-avatar-data').length);
    expect(result.stream).toBeDefined();

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('user-avatar-data');
  });

  it('should throw NotFoundException when file does not exist', async () => {
    await expect(service.getStream('rooms-avatars/non-existent.png')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException on path traversal attempt', async () => {
    await expect(
      service.getStream('../../etc/passwd', 'rooms-avatars'),
    ).rejects.toThrow(BadRequestException);
  });
});
