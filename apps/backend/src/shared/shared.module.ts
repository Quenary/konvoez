import { Global, Module } from '@nestjs/common';
import { AppService } from './services/app.service';
import { PasswordService } from './services/password.service';
import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { S3ClientInjectionToken } from './tokens/s3-client.token';
import { EncryptionService } from './services/encryption.service';
import { LocalObjectStorageService } from './services/local-object-storage.service';
import { S3Service } from './services/s3.service';
import type { FileService } from './services/file.service';
import { FileServiceInjectionToken } from './tokens/file-service.token';
import { ImageProcessingService } from './services/image-processing.service';

@Global()
@Module({
  providers: [
    AppService,
    PasswordService,
    EncryptionService,
    LocalObjectStorageService,
    S3Service,
    ImageProcessingService,
    {
      provide: S3ClientInjectionToken,
      inject: [AppService],
      useFactory: (configService: AppService) => {
        const config: S3ClientConfig = {
          region: configService.S3_REGION,
          endpoint: configService.S3_ENDPOINT,
          forcePathStyle: configService.S3_FORCE_PATH_STYLE,
        };
        if (configService.S3_ACCESS_KEY_ID && configService.S3_ACCESS_KEY) {
          config.credentials = {
            accessKeyId: configService.S3_ACCESS_KEY_ID,
            secretAccessKey: configService.S3_ACCESS_KEY,
          };
        }
        return new S3Client(config);
      },
    },
    {
      provide: FileServiceInjectionToken,
      inject: [AppService, S3Service, LocalObjectStorageService],
      useFactory: (
        configService: AppService,
        s3Service: S3Service,
        localService: LocalObjectStorageService,
      ): FileService => {
        return configService.OBJECT_STORAGE === 's3' ? s3Service : localService;
      },
    },
  ],
  exports: [
    AppService,
    PasswordService,
    FileServiceInjectionToken,
    EncryptionService,
    ImageProcessingService,
  ],
})
export class SharedModule {}
