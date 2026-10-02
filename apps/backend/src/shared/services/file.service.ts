import { PayloadTooLargeException } from '@nestjs/common';
import { maxAvatarSize } from '@konvoez/shared';
import { Readable } from 'stream';

export const USER_AVATARS_BUCKET = 'users-avatars';
export const ROOM_AVATARS_BUCKET = 'rooms-avatars';
export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';

export const avatarUploadLimits = {
  fileSize: maxAvatarSize,
} as const;

export function assertAvatarFileSize(
  file: Express.Multer.File | undefined,
): void {
  if (file && file.size > maxAvatarSize) {
    throw new PayloadTooLargeException('Avatar file is too large');
  }
}

export const FILE_BUCKETS = [
  USER_AVATARS_BUCKET,
  ROOM_AVATARS_BUCKET,
  MESSAGE_ATTACHMENTS_BUCKET,
] as const;

export interface PutFileSource {
  path: string;
  size: number;
  contentType: string;
}

export interface FileByteRange {
  start: number;
  end: number;
}

export interface FileStreamResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
}

export interface StoredFileInfo {
  key: string;
  modifiedAt: Date;
}

export interface FileService {
  upload(file: Express.Multer.File, bucket?: string): Promise<string>;
  /** Stores a temp file under an exact key. Takes ownership of source.path. */
  putFile(key: string, source: PutFileSource, bucket: string): Promise<void>;
  getStream(
    key: string,
    bucket?: string,
    range?: FileByteRange,
  ): Promise<FileStreamResult>;
  delete(key: string, bucket?: string): Promise<void>;
  list(bucket: string): Promise<StoredFileInfo[]>;
}

export { FileServiceInjectionToken } from '../tokens/file-service.token';
