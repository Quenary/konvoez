import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { S3ClientInjectionToken } from '../tokens/s3-client.token';
import { FileService, FileStreamResult } from './file.service';

@Injectable()
export class S3Service implements FileService {
  private readonly logger = new Logger(S3Service.name);
  private readonly checkedBuckets = new Set<string>();

  constructor(
    @Inject(S3ClientInjectionToken)
    private readonly s3Client: S3Client,
  ) {}

  public async upload(
    file: Express.Multer.File,
    bucket = 'default',
  ): Promise<string> {
    await this.ensureBucketExists(bucket);

    const key = `${bucket}/${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    return key;
  }

  public async getStream(
    key: string,
    bucket?: string,
  ): Promise<FileStreamResult> {
    const target = this.parseBucketAndKey(key, bucket);

    try {
      const command = new GetObjectCommand({
        Bucket: target.bucket,
        Key: target.key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException('File is empty or missing');
      }

      return {
        stream: response.Body as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
      };
    } catch (error) {
      if (
        error instanceof NoSuchKey ||
        (error instanceof S3ServiceException &&
          (error.name === 'NoSuchKey' ||
            error['$metadata']?.httpStatusCode === 404))
      ) {
        throw new NotFoundException('File not found in S3');
      }
      throw error;
    }
  }

  protected async ensureBucketExists(bucket: string): Promise<void> {
    if (this.checkedBuckets.has(bucket)) {
      return;
    }

    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: bucket,
        }),
      );
      this.checkedBuckets.add(bucket);
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.name === 'NotFound' ||
          error.name === 'NoSuchBucket' ||
          error['$metadata']?.httpStatusCode === 404)
      ) {
        try {
          await this.s3Client.send(
            new CreateBucketCommand({
              Bucket: bucket,
            }),
          );
          this.checkedBuckets.add(bucket);
        } catch (createError) {
          this.logger.error(
            `Failed to create bucket ${bucket}`,
            createError instanceof Error
              ? createError.stack
              : String(createError),
          );
        }
      } else {
        this.logger.error(
          `Error checking bucket ${bucket}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private parseBucketAndKey(
    key: string,
    bucket?: string,
  ): { bucket: string; key: string } {
    if (bucket) {
      return { bucket, key };
    }
    const slashIndex = key.indexOf('/');
    if (slashIndex > 0) {
      return {
        bucket: key.substring(0, slashIndex),
        key,
      };
    }
    return { bucket: 'default', key };
  }
}
