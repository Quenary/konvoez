import { S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import { FileService } from '@shared/services/file.service';
import { s3ClientInjectionToken } from '@shared/tokens/s3-client.token';

@Injectable()
export class RoomsAvatarsService extends FileService {
  protected readonly bucketName = 'rooms-avatars';

  constructor(
    @Inject(s3ClientInjectionToken)
    protected readonly s3Client: S3Client,
  ) {
    super(s3Client);
  }
}
