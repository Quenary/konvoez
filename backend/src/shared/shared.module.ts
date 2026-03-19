import { Global, Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { PasswordService } from './services/password.service';
import { S3Client } from '@aws-sdk/client-s3';
import { s3ClientInjectionToken } from './tokens/s3-client.token';

@Global()
@Module({
  providers: [
    ConfigService,
    PasswordService,
    {
      provide: s3ClientInjectionToken,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new S3Client({
          region: configService.S3_REGION,
          endpoint: configService.S3_ENDPOINT,
          credentials: {
            accessKeyId: configService.S3_ACCESS_KEY_ID,
            secretAccessKey: configService.S3_ACCESS_KEY,
          },
          forcePathStyle: configService.S3_FORCE_PATH_STYLE,
        });
      },
    },
  ],
  exports: [ConfigService, PasswordService, s3ClientInjectionToken],
})
export class SharedModule {}
