import {
  EAttachmentKind,
  INLINE_IMAGE_MIMES,
  INLINE_VIDEO_MIMES,
  IAttachment,
  ITextRoomCreateMessage,
  ITextRoomMessage,
} from '@konvoez/shared';
import { v4 } from 'uuid';

export type TAttachmentUploadErrorCode =
  | 'tooLarge'
  | 'disabled'
  | 'rateLimited'
  | 'storageFull'
  | 'network'
  | 'server'
  | 'expired';

export interface ILocalFile {
  readonly localId: string;
  readonly file: File;
  readonly kind: EAttachmentKind;
  readonly previewUrl: string | null;
}

export type TOutgoingFileState =
  | { readonly status: 'queued' }
  | { readonly status: 'uploading' }
  | { readonly status: 'uploaded'; readonly attachment: IAttachment }
  | { readonly status: 'failed'; readonly code: TAttachmentUploadErrorCode };

export type IOutgoingFile = ILocalFile & { readonly state: TOutgoingFileState };

export type TOutgoingPhase =
  | { readonly phase: 'uploading' }
  | { readonly phase: 'creating' }
  | { readonly phase: 'failed'; readonly reason: 'upload' | 'create' };

export interface IOutgoingMessage {
  readonly tempId: string;
  readonly data: ITextRoomCreateMessage;
  readonly replyTo: ITextRoomMessage['replyTo'];
  readonly createdAt: Date;
  readonly files: readonly IOutgoingFile[];
  readonly state: TOutgoingPhase;
}

const imageMimes: readonly string[] = INLINE_IMAGE_MIMES;
const videoMimes: readonly string[] = INLINE_VIDEO_MIMES;

export function uploadErrorKey(code: TAttachmentUploadErrorCode): string {
  switch (code) {
    case 'tooLarge':
      return 'ROOMS.UPLOAD_ERROR.TOO_LARGE';
    case 'disabled':
      return 'ROOMS.UPLOAD_ERROR.DISABLED';
    case 'rateLimited':
      return 'ROOMS.UPLOAD_ERROR.RATE_LIMITED';
    case 'storageFull':
      return 'ROOMS.UPLOAD_ERROR.STORAGE_FULL';
    case 'network':
      return 'ROOMS.UPLOAD_ERROR.NETWORK';
    case 'expired':
      return 'ROOMS.UPLOAD_ERROR.EXPIRED';
    default:
      return 'ROOMS.UPLOAD_ERROR.SERVER';
  }
}

export function revokeLocalFiles(files: readonly ILocalFile[]): void {
  for (const file of files) {
    if (file.previewUrl) {
      URL.revokeObjectURL(file.previewUrl);
    }
  }
}

export function createLocalFile(file: File): ILocalFile {
  const localId = v4();
  if (imageMimes.includes(file.type)) {
    return {
      localId,
      file,
      kind: EAttachmentKind.IMAGE,
      previewUrl: URL.createObjectURL(file),
    };
  }
  if (videoMimes.includes(file.type)) {
    return {
      localId,
      file,
      kind: EAttachmentKind.VIDEO,
      previewUrl: URL.createObjectURL(file),
    };
  }
  if (file.type.startsWith('audio/')) {
    return {
      localId,
      file,
      kind: EAttachmentKind.AUDIO,
      previewUrl: null,
    };
  }
  return {
    localId,
    file,
    kind: EAttachmentKind.FILE,
    previewUrl: null,
  };
}

export function isBlankMessageContent(content: string): boolean {
  const text = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return text.length === 0;
}
