import { Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { pipeline } from 'stream/promises';
import fs from 'fs';
import path from 'path';
import { AppService } from './app.service';
import {
  FILE_BUCKETS,
  FileByteRange,
  FileService,
  FileStat,
  FileStreamResult,
  PutFileSource,
  StoredFileInfo,
} from './file.service';
import { StorageNamingService } from './storage-naming.service';

@Injectable()
export class LocalObjectStorageService implements FileService {
  constructor(
    private readonly appService: AppService,
    private readonly storageNamingService: StorageNamingService,
  ) {}

  public async upload(
    file: Express.Multer.File,
    bucket?: string,
  ): Promise<string> {
    const folder = bucket ? bucket : '';
    const sanitizedOriginalName = path.basename(file.originalname);
    const filename = `${Date.now()}-${sanitizedOriginalName}`;
    const key = folder ? `${folder}/${filename}` : filename;
    const fullPath = this.resolveSafePath(key, bucket);
    const dir = path.dirname(fullPath);

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullPath, file.buffer);

    return key;
  }

  public async putFile(
    key: string,
    source: PutFileSource,
    bucket: string,
  ): Promise<void> {
    const fullKey = this.normalizeKey(key, bucket);
    const fullPath = this.resolveSafePath(fullKey, bucket);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    try {
      await fs.promises.rename(source.path, fullPath);
    } catch (error) {
      if (!this.isExdev(error)) {
        throw error;
      }
      await pipeline(
        fs.createReadStream(source.path),
        fs.createWriteStream(fullPath),
      );
      await fs.promises.unlink(source.path);
    }
  }

  public async delete(key: string, bucket?: string): Promise<void> {
    const fullPath = this.resolveSafePath(
      this.normalizeKey(key, bucket),
      bucket,
    );

    try {
      await fs.promises.unlink(fullPath);
    } catch (error) {
      if (!this.isEnoent(error)) {
        throw error;
      }
    }
  }

  public async list(bucket: string): Promise<StoredFileInfo[]> {
    const dir = this.resolveSafePath(bucket, bucket);

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (this.isEnoent(error)) {
        return [];
      }
      throw error;
    }

    const files: StoredFileInfo[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const key = `${bucket}/${entry.name}`;
      try {
        const stat = await fs.promises.stat(this.resolveSafePath(key, bucket));
        if (!stat.isFile()) {
          continue;
        }
        files.push({ key, modifiedAt: stat.mtime });
      } catch (error) {
        if (!this.isEnoent(error)) {
          throw error;
        }
      }
    }

    return files;
  }

  public async stat(key: string, bucket?: string): Promise<FileStat> {
    const fullPath = this.resolveSafePath(
      this.normalizeKey(key, bucket),
      bucket,
    );
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch {
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        `File not found: ${key}`,
      );
    }
    if (!stat.isFile()) {
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        `File not found: ${key}`,
      );
    }
    return { size: stat.size };
  }

  public async getStream(
    key: string,
    bucket?: string,
    range?: FileByteRange,
  ): Promise<FileStreamResult> {
    const fullPath = this.resolveSafePath(
      this.normalizeKey(key, bucket),
      bucket,
    );

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch {
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        `File not found: ${key}`,
      );
    }

    if (!stat.isFile()) {
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        `File not found: ${key}`,
      );
    }

    const contentLength = range ? range.end - range.start + 1 : stat.size;

    return {
      stream: fs.createReadStream(
        fullPath,
        range ? { start: range.start, end: range.end } : undefined,
      ),
      contentType: this.getContentType(fullPath),
      contentLength,
    };
  }

  private get basePath(): string {
    return path.resolve(this.appService.LOCAL_OBJECT_STORAGE_PATH);
  }

  private normalizeKey(key: string, bucket?: string): string {
    if (bucket) {
      for (const otherBucket of FILE_BUCKETS) {
        if (
          otherBucket !== bucket &&
          (key === otherBucket || key.startsWith(`${otherBucket}/`))
        ) {
          throw AppException.badRequest(
            ApiErrorCode.BAD_REQUEST,
            'Invalid key: storage bucket isolation violation',
          );
        }
      }
      if (key === bucket || key.startsWith(`${bucket}/`)) {
        return key;
      }
      return `${bucket}/${key}`;
    }
    return key;
  }

  private isEnoent(error: unknown): boolean {
    return this.hasCode(error, 'ENOENT');
  }

  private isExdev(error: unknown): boolean {
    return this.hasCode(error, 'EXDEV');
  }

  private hasCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }

  private resolveSafePath(relativePath: string, bucket?: string): string {
    if (
      relativePath.includes('\0') ||
      relativePath.split(/[/\\]/).some((part) => part === '..' || part === '.')
    ) {
      throw AppException.badRequest(
        ApiErrorCode.BAD_REQUEST,
        'Invalid path: path traversal detected',
      );
    }

    const physical =
      this.storageNamingService.toPhysicalRelativePath(relativePath);
    const resolved = path.resolve(this.basePath, physical);

    const safeBase = this.basePath.endsWith(path.sep)
      ? this.basePath
      : `${this.basePath}${path.sep}`;

    if (resolved !== this.basePath && !resolved.startsWith(safeBase)) {
      throw AppException.badRequest(
        ApiErrorCode.BAD_REQUEST,
        'Invalid path: path traversal detected',
      );
    }

    if (bucket) {
      const physicalBucket =
        this.storageNamingService.resolvePhysicalBucket(bucket);
      const bucketDir = path.resolve(this.basePath, physicalBucket);
      const safeBucketDir = bucketDir.endsWith(path.sep)
        ? bucketDir
        : `${bucketDir}${path.sep}`;

      if (resolved !== bucketDir && !resolved.startsWith(safeBucketDir)) {
        throw AppException.badRequest(
          ApiErrorCode.BAD_REQUEST,
          'Invalid path: storage bucket isolation bypass detected',
        );
      }
    }

    return resolved;
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }
}
