import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pipeline } from 'stream/promises';
import fs from 'fs';
import path from 'path';
import { AppService } from './app.service';
import {
  FileByteRange,
  FileService,
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
    const fullPath = this.resolveSafePath(key);
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
    const fullPath = this.resolveSafePath(fullKey);
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
    const fullPath = this.resolveSafePath(this.normalizeKey(key, bucket));

    try {
      await fs.promises.unlink(fullPath);
    } catch (error) {
      if (!this.isEnoent(error)) {
        throw error;
      }
    }
  }

  public async list(bucket: string): Promise<StoredFileInfo[]> {
    const dir = this.resolveSafePath(bucket);

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
        const stat = await fs.promises.stat(this.resolveSafePath(key));
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

  public async getStream(
    key: string,
    bucket?: string,
    range?: FileByteRange,
  ): Promise<FileStreamResult> {
    const fullPath = this.resolveSafePath(this.normalizeKey(key, bucket));

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch {
      throw new NotFoundException(`File not found: ${key}`);
    }

    if (!stat.isFile()) {
      throw new NotFoundException(`File not found: ${key}`);
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
    if (bucket && !key.startsWith(`${bucket}/`) && key !== bucket) {
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

  private resolveSafePath(relativePath: string): string {
    const physical =
      this.storageNamingService.toPhysicalRelativePath(relativePath);
    const resolved = path.resolve(this.basePath, physical);
    if (!resolved.startsWith(this.basePath)) {
      throw new BadRequestException('Invalid path: path traversal detected');
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
