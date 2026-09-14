import {
  CreateBucketCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { S3Service } from './s3.service';

describe('S3Service', () => {
  let service: S3Service;
  let mockS3Client: jest.Mocked<Partial<S3Client>>;

  beforeEach(() => {
    mockS3Client = {
      send: jest.fn(),
    };
    service = new S3Service(mockS3Client as unknown as S3Client);
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
    expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
    expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
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

  it('should throw NotFoundException when key does not exist', async () => {
    (mockS3Client.send as jest.Mock).mockRejectedValueOnce(
      new NoSuchKey({ message: 'The specified key does not exist.', $metadata: {} }),
    );

    await expect(service.getStream('rooms-avatars/missing.png')).rejects.toThrow(
      NotFoundException,
    );
  });
});
