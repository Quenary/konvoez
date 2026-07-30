import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import {
  Global,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3ClientInjectionToken } from '@shared/tokens/s3-client.token';
import { Readable } from 'stream';
import { maxAvatarSize } from '@konvoez/shared';

@Global()
@Injectable()
export class AvatarsService {
  private readonly bucketName = 'avatars2';

  constructor(
    @Inject(s3ClientInjectionToken)
    private readonly s3Client: S3Client,
  ) {
    this.ensureBucketExists();
  }

  /**
   * Загрузка аватарки
   * @param file файл
   * @param userId ид пользователя
   * @returns ключ аватарки
   */
  async uploadAvatar(file: Express.Multer.File): Promise<string> {
    if (file.size > maxAvatarSize) {
      throw new HttpException('Avatar size is too big', HttpStatus.BAD_REQUEST);
    }

    const key = `avatars/${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    return key;
  }

  async getAvatarUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getAvatarStream(key: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException('Avatar file is empty or missing');
      }

      return {
        // AWS SDK v3 возвращает Node.js Readable stream
        stream: response.Body as Readable,
        contentType: response.ContentType || 'image/jpeg',
        contentLength: response.ContentLength,
      };
    } catch (error) {
      if (error instanceof NoSuchKey) {
        throw new NotFoundException('Avatar file not found in S3');
      }
      throw error;
    }
  }

  private async ensureBucketExists() {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.bucketName,
        }),
      );
      console.info(`Bucket ${this.bucketName} exists`);
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error['name'] === 'NotFound' ||
          error['$metadata']?.httpStatusCode === 404)
      ) {
        try {
          await this.s3Client.send(
            new CreateBucketCommand({
              Bucket: this.bucketName,
            }),
          );
          console.info(`Bucket ${this.bucketName} created successfully`);
        } catch (createError) {
          console.error(`Failed to create bucket: ${createError}`);
        }
      } else {
        console.error(`Error checking bucket: ${error}`);
      }
    }
  }
}
