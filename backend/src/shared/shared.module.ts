import { Global, Module } from '@nestjs/common';
import { AppService } from './services/app.service';
import { PasswordService } from './services/password.service';
import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { s3ClientInjectionToken } from './tokens/s3-client.token';

@Global()
@Module({
  providers: [
    AppService,
    PasswordService,
    {
      provide: s3ClientInjectionToken,
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
  ],
  exports: [AppService, PasswordService, s3ClientInjectionToken],
})
export class SharedModule {}
