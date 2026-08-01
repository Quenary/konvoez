import { S3Client } from '@aws-sdk/client-s3';
import { InjectionToken } from '@nestjs/common';

export const S3ClientInjectionToken: InjectionToken<S3Client> = 'S3Client';
