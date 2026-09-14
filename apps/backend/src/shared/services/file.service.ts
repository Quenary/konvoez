import { Readable } from 'stream';

export interface FileStreamResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
}

export interface FileService {
  upload(file: Express.Multer.File, bucket?: string): Promise<string>;
  getStream(key: string, bucket?: string): Promise<FileStreamResult>;
}

export { FileServiceInjectionToken } from '../tokens/file-service.token';
