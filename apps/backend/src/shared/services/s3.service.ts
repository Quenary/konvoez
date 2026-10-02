import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import fs from 'fs';
import { Readable } from 'stream';
import { S3ClientInjectionToken } from '../tokens/s3-client.token';
import {
  FileByteRange,
  FileService,
  FileStreamResult,
  PutFileSource,
  StoredFileInfo,
} from './file.service';
import { StorageNamingService } from './storage-naming.service';

@Injectable()
export class S3Service implements FileService {
  private readonly logger = new Logger(S3Service.name);
  private readonly checkedBuckets = new Set<string>();

  constructor(
    @Inject(S3ClientInjectionToken)
    private readonly s3Client: S3Client,
    private readonly storageNamingService: StorageNamingService,
  ) {}

  public async upload(
    file: Express.Multer.File,
    bucket = 'default',
  ): Promise<string> {
    await this.ensureBucketExists(
      this.storageNamingService.resolvePhysicalBucket(bucket),
    );

    const key = `${bucket}/${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: this.storageNamingService.resolvePhysicalBucket(bucket),
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    return key;
  }

  public async putFile(
    key: string,
    source: PutFileSource,
    bucket: string,
  ): Promise<void> {
    const physical = this.storageNamingService.resolvePhysicalBucket(bucket);
    await this.ensureBucketExists(physical);
    const objectKey = key.startsWith(`${bucket}/`) ? key : `${bucket}/${key}`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: physical,
        Key: objectKey,
        Body: fs.createReadStream(source.path),
        ContentLength: source.size,
        ContentType: source.contentType,
      }),
    );
    await fs.promises.unlink(source.path);
  }

  public async delete(key: string, bucket?: string): Promise<void> {
    const target = this.parseBucketAndKey(key, bucket);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: target.bucket,
          Key: target.key,
        }),
      );
    } catch (error) {
      if (!this.isMissingObject(error)) {
        throw error;
      }
    }
  }

  public async list(bucket: string): Promise<StoredFileInfo[]> {
    const files: StoredFileInfo[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const response = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.storageNamingService.resolvePhysicalBucket(bucket),
            ContinuationToken: continuationToken,
          }),
        );

        for (const object of response.Contents ?? []) {
          if (object.Key && object.LastModified) {
            files.push({ key: object.Key, modifiedAt: object.LastModified });
          }
        }

        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);
    } catch (error) {
      if (this.isMissingBucket(error)) {
        return [];
      }
      throw error;
    }

    return files;
  }

  public async getStream(
    key: string,
    bucket?: string,
    range?: FileByteRange,
  ): Promise<FileStreamResult> {
    const target = this.parseBucketAndKey(key, bucket);

    try {
      const command = new GetObjectCommand({
        Bucket: target.bucket,
        Key: target.key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
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
      if (this.isMissingObject(error)) {
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
      if (this.isMissingBucket(error)) {
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

  private isMissingObject(error: unknown): boolean {
    return (
      error instanceof NoSuchKey ||
      (error instanceof S3ServiceException &&
        (error.name === 'NoSuchKey' ||
          error['$metadata']?.httpStatusCode === 404))
    );
  }

  private isMissingBucket(error: unknown): boolean {
    return (
      error instanceof S3ServiceException &&
      (error.name === 'NotFound' ||
        error.name === 'NoSuchBucket' ||
        error['$metadata']?.httpStatusCode === 404)
    );
  }

  private parseBucketAndKey(
    key: string,
    bucket?: string,
  ): { bucket: string; key: string } {
    const logicalBucket = bucket
      ? bucket
      : (() => {
          const slashIndex = key.indexOf('/');
          return slashIndex > 0 ? key.substring(0, slashIndex) : 'default';
        })();
    return {
      bucket: this.storageNamingService.resolvePhysicalBucket(logicalBucket),
      key,
    };
  }
}
