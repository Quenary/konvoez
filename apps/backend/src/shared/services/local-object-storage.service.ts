import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { AppService } from './app.service';
import { FileService, FileStreamResult, StoredFileInfo } from './file.service';

@Injectable()
export class LocalObjectStorageService implements FileService {
  constructor(private readonly appService: AppService) {}

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

    return {
      stream: fs.createReadStream(fullPath),
      contentType: this.getContentType(fullPath),
      contentLength: stat.size,
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
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }

  private resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.basePath, relativePath);
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
