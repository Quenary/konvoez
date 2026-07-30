import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';

export abstract class FileService {
  protected abstract readonly bucketName: string;

  constructor(protected readonly s3Client: S3Client) {}

  /**
   * Загрузка файла
   * @param file файл
   * @returns ключ файла
   */
  async upload(file: Express.Multer.File): Promise<string> {
    const key = `${this.bucketName}/${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    return key;
  }

  /**
   * Получение signed url для файла
   * @param key ключ файла
   * @param expiresIn время жизни ссылки в секундах
   * @returns
   */
  async getSignedUrl(key: string, expiresIn = 60): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Получение потока файла
   * @param key ключ файла
   * @returns
   */
  async getStream(key: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException('File is empty or missing');
      }

      return {
        // AWS SDK v3 возвращает Node.js Readable stream
        stream: response.Body as Readable,
        contentType: response.ContentType || 'image/jpeg',
        contentLength: response.ContentLength,
      };
    } catch (error) {
      if (error instanceof NoSuchKey) {
        throw new NotFoundException('File not found in S3');
      }
      throw error;
    }
  }

  protected async ensureBucketExists() {
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
        console.info(`Bucket ${this.bucketName} not found, creating...`);
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
