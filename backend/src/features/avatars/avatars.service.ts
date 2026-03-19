import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3ClientInjectionToken } from 'src/shared/tokens/s3-client.token';

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
  async uploadAvatar(
    file: Express.Multer.File,
    userId: number,
  ): Promise<string> {
    const key = `avatars/${userId}-${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    return key;
  }

  async getAvatarUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  private async ensureBucketExists() {
    try {
      // Проверяем, существует ли бакет
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.bucketName,
        }),
      );
      console.log(`Bucket ${this.bucketName} exists`);
    } catch (error) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        // Бакет не существует - создаем его
        try {
          await this.s3Client.send(
            new CreateBucketCommand({
              Bucket: this.bucketName,
            }),
          );
          console.log(`Bucket ${this.bucketName} created successfully`);
        } catch (createError) {
          console.error(`Failed to create bucket: ${createError.message}`);
        }
      } else {
        console.error(`Error checking bucket: ${error.message}`);
      }
    }
  }
}
