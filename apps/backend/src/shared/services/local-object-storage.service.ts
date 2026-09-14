import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { AppService } from './app.service';
import { FileService, FileStreamResult } from './file.service';

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

  public async getStream(
    key: string,
    bucket?: string,
  ): Promise<FileStreamResult> {
    let normalizedKey = key;
    if (bucket && !key.startsWith(bucket + '/') && key !== bucket) {
      normalizedKey = `${bucket}/${key}`;
    }
    const fullPath = this.resolveSafePath(normalizedKey);

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
