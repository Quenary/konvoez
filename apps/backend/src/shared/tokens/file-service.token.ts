import { InjectionToken } from '@nestjs/common';
import { FileService } from '../services/file.service';

export const FileServiceInjectionToken: InjectionToken<FileService> =
  'FileService';
