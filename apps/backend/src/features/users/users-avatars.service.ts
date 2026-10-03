import { Inject, Injectable } from '@nestjs/common';
import {
  FileServiceInjectionToken,
  USER_AVATARS_BUCKET,
  assertAvatarFileSize,
  type FileService,
  type FileStreamResult,
} from '@shared/services/file.service';
import { ImageProcessingService } from '@shared/services/image-processing.service';

@Injectable()
export class UsersAvatarsService {
  private readonly bucketName = USER_AVATARS_BUCKET;

  constructor(
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
    private readonly imageProcessingService: ImageProcessingService,
  ) {}

  public async upload(file: Express.Multer.File): Promise<string> {
    assertAvatarFileSize(file);
    const processedFile = await this.imageProcessingService.convertToWebp(file);
    return this.fileService.upload(processedFile, this.bucketName);
  }

  public async getStream(key: string): Promise<FileStreamResult> {
    return this.fileService.getStream(key, this.bucketName);
  }
}
