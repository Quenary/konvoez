import { Injectable } from '@nestjs/common';
import { AppService } from './app.service';
import {
  resolvePhysicalBucket,
  toPhysicalRelativePath,
} from './storage-naming';

@Injectable()
export class StorageNamingService {
  constructor(private readonly appService: AppService) {}

  public resolvePhysicalBucket(logical: string): string {
    return resolvePhysicalBucket(
      logical,
      this.appService.OBJECT_STORAGE_PREFIX,
    );
  }

  public toPhysicalRelativePath(logicalKey: string): string {
    return toPhysicalRelativePath(
      logicalKey,
      this.appService.OBJECT_STORAGE_PREFIX,
    );
  }
}
