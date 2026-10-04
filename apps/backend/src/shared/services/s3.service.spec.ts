import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppService } from './app.service';
import { S3Service } from './s3.service';
import { StorageNamingService } from './storage-naming.service';

describe('S3Service', () => {
  let service: S3Service;
  let mockS3Client: jest.Mocked<Partial<S3Client>>;

  beforeEach(() => {
    mockS3Client = {
      send: jest.fn(),
    };
    const appService = {
      OBJECT_STORAGE_PREFIX: '',
    } as unknown as AppService;
    service = new S3Service(
      mockS3Client as unknown as S3Client,
      new StorageNamingService(appService),
    );
  });

  it('should upload a file to S3', async () => {
    (mockS3Client.send as jest.Mock).mockResolvedValueOnce({}); // headBucket succeeds
    (mockS3Client.send as jest.Mock).mockResolvedValueOnce({}); // putObject succeeds

    const mockFile = {
      originalname: 'room.png',
      buffer: Buffer.from('room-data'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    const key = await service.upload(mockFile, 'rooms-avatars');

    expect(key).toMatch(/^rooms-avatars\/\d+-room\.png$/);
    expect(mockS3Client.send).toHaveBeenCalledWith(
      expect.any(HeadBucketCommand),
    );
    expect(mockS3Client.send).toHaveBeenCalledWith(
      expect.any(PutObjectCommand),
    );
  });

  it('should get a stream from S3', async () => {
    const readable = Readable.from(['stream data']);
    (mockS3Client.send as jest.Mock).mockResolvedValueOnce({
      Body: readable,
      ContentType: 'image/png',
      ContentLength: 11,
    });

    const result = await service.getStream('rooms-avatars/123-room.png');

    expect(result.contentType).toBe('image/png');
    expect(result.contentLength).toBe(11);
    expect(result.stream).toBeDefined();
  });

  it('should stat an object', async () => {
    (mockS3Client.send as jest.Mock).mockResolvedValueOnce({
      ContentLength: 26,
    });

    await expect(service.stat('message-attachments/id')).resolves.toEqual({
      size: 26,
    });

    const head = (mockS3Client.send as jest.Mock).mock
      .calls[0]?.[0] as HeadObjectCommand;
    expect(head).toBeInstanceOf(HeadObjectCommand);
    expect(head.input.Key).toBe('message-attachments/id');
  });

  it('should throw NotFoundException when key does not exist', async () => {
    (mockS3Client.send as jest.Mock).mockRejectedValueOnce(
      new NoSuchKey({
        message: 'The specified key does not exist.',
        $metadata: {},
      }),
    );

    await expect(
      service.getStream('rooms-avatars/missing.png'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete an object from S3', async () => {
    (mockS3Client.send as jest.Mock).mockResolvedValueOnce({});

    await service.delete('rooms-avatars/123-room.png');

    expect(mockS3Client.send).toHaveBeenCalledWith(
      expect.any(DeleteObjectCommand),
    );
  });

  it('should list object keys across pages', async () => {
    const firstModified = new Date('2026-01-01T00:00:00Z');
    const secondModified = new Date('2026-01-02T00:00:00Z');
    (mockS3Client.send as jest.Mock)
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'rooms-avatars/1-a.png', LastModified: firstModified },
          { Key: 'rooms-avatars/missing-date.png' },
        ],
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'rooms-avatars/2-b.png', LastModified: secondModified },
        ],
        IsTruncated: false,
      });

    await expect(service.list('rooms-avatars')).resolves.toEqual([
      { key: 'rooms-avatars/1-a.png', modifiedAt: firstModified },
      { key: 'rooms-avatars/2-b.png', modifiedAt: secondModified },
    ]);
    expect(mockS3Client.send).toHaveBeenCalledWith(
      expect.any(ListObjectsV2Command),
    );
  });

  it('should return an empty list when the bucket does not exist', async () => {
    const error = new S3ServiceException({
      name: 'NoSuchBucket',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
      message: 'The specified bucket does not exist',
    });
    error.name = 'NoSuchBucket';
    (mockS3Client.send as jest.Mock).mockRejectedValueOnce(error);

    await expect(service.list('rooms-avatars')).resolves.toEqual([]);
  });

  it('should put a stream with ContentLength and unlink the source', async () => {
    const dir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'konvoez-s3-'),
    );
    try {
      const source = path.join(dir, 'upload.bin');
      await fs.promises.writeFile(source, 'payload');
      (mockS3Client.send as jest.Mock).mockImplementation(
        async (command: { input?: { Body?: AsyncIterable<unknown> } }) => {
          const body = command.input?.Body;
          if (body && Symbol.asyncIterator in Object(body)) {
            for await (const chunk of body) {
              void chunk;
            }
          }
          return {};
        },
      );

      await service.putFile(
        'message-attachments/id',
        {
          path: source,
          size: 7,
          contentType: 'application/octet-stream',
        },
        'message-attachments',
      );

      const put = (mockS3Client.send as jest.Mock).mock.calls
        .map((call) => call[0] as PutObjectCommand)
        .find((command) => command instanceof PutObjectCommand);
      expect(put?.input.Bucket).toBe('message-attachments');
      expect(put?.input.Key).toBe('message-attachments/id');
      expect(put?.input.ContentLength).toBe(7);
      expect(put?.input.ContentType).toBe('application/octet-stream');
      expect(put?.input.Body).toBeDefined();
      expect(fs.existsSync(source)).toBe(false);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  it('should request a byte range', async () => {
    (mockS3Client.send as jest.Mock).mockResolvedValueOnce({
      Body: Readable.from(['ab']),
      ContentType: 'application/octet-stream',
      ContentLength: 2,
    });

    await service.getStream('message-attachments/id', undefined, {
      start: 0,
      end: 1,
    });

    const get = (mockS3Client.send as jest.Mock).mock
      .calls[0]?.[0] as GetObjectCommand;
    expect(get.input.Range).toBe('bytes=0-1');
  });

  it('should use the prefixed bucket while keeping the logical object key', async () => {
    const prefixed = new S3Service(
      mockS3Client as unknown as S3Client,
      new StorageNamingService({
        OBJECT_STORAGE_PREFIX: 'dev',
      } as unknown as AppService),
    );
    (mockS3Client.send as jest.Mock).mockResolvedValue({});
    await prefixed.delete('users-avatars/1-a.png');
    const deleted = (mockS3Client.send as jest.Mock).mock
      .calls[0]?.[0] as DeleteObjectCommand;
    expect(deleted.input).toMatchObject({
      Bucket: 'dev-users-avatars',
      Key: 'users-avatars/1-a.png',
    });
  });
});
