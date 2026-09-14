import { Inject, Injectable } from '@nestjs/common';
import {
  FileServiceInjectionToken,
  type FileService,
  type FileStreamResult,
} from '@shared/services/file.service';

@Injectable()
export class UsersAvatarsService {
  private readonly bucketName = 'users-avatars';

  constructor(
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
  ) {}

  public async upload(file: Express.Multer.File): Promise<string> {
    return this.fileService.upload(file, this.bucketName);
  }

  public async getStream(key: string): Promise<FileStreamResult> {
    return this.fileService.getStream(key, this.bucketName);
  }
}
