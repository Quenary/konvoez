import { IClientVideoPoster } from '@core/services/video-poster.service';
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
  | 'expired'
  | 'unreadable';

export interface ILocalFile {
  readonly localId: string;
  readonly file: File;
  readonly kind: EAttachmentKind;
  readonly previewUrl: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly posterStatus: 'pending' | 'ready';
  readonly posterFile: File | null;
  readonly posterUrl: string | null;
  readonly videoWidth: number | null;
  readonly videoHeight: number | null;
  readonly videoDuration: number | null;
  readonly disposePoster?: () => void;
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
    case 'unreadable':
      return 'ROOMS.UPLOAD_ERROR.UNREADABLE';
    default:
      return 'ROOMS.UPLOAD_ERROR.SERVER';
  }
}

export function withClientPoster<T extends ILocalFile>(
  file: T,
  result: IClientVideoPoster | null,
  posterUrl: string | null,
): T {
  return {
    ...file,
    posterStatus: 'ready',
    posterFile: file.posterFile ?? result?.poster ?? null,
    posterUrl,
    videoWidth: file.videoWidth ?? result?.videoWidth ?? null,
    videoHeight: file.videoHeight ?? result?.videoHeight ?? null,
    videoDuration: file.videoDuration ?? result?.durationSeconds ?? null,
    width: file.width ?? result?.displayWidth ?? null,
    height: file.height ?? result?.displayHeight ?? null,
  };
}

export function revokeLocalFiles(files: readonly ILocalFile[]): void {
  for (const file of files) {
    file.disposePoster?.();
    if (file.previewUrl) {
      URL.revokeObjectURL(file.previewUrl);
    }
    if (file.posterUrl) {
      URL.revokeObjectURL(file.posterUrl);
    }
  }
}

const emptyPoster = {
  posterStatus: 'ready' as const,
  posterFile: null,
  posterUrl: null,
  videoWidth: null,
  videoHeight: null,
  videoDuration: null,
};

export function createLocalFile(file: File): ILocalFile {
  const localId = v4();
  if (imageMimes.includes(file.type)) {
    return {
      localId,
      file,
      kind: EAttachmentKind.IMAGE,
      previewUrl: URL.createObjectURL(file),
      ...emptyPoster,
    };
  }
  if (videoMimes.includes(file.type)) {
    return {
      localId,
      file,
      kind: EAttachmentKind.VIDEO,
      previewUrl: URL.createObjectURL(file),
      ...emptyPoster,
      posterStatus: 'pending',
    };
  }
  if (file.type.startsWith('audio/')) {
    return {
      localId,
      file,
      kind: EAttachmentKind.AUDIO,
      previewUrl: null,
      ...emptyPoster,
    };
  }
  return {
    localId,
    file,
    kind: EAttachmentKind.FILE,
    previewUrl: null,
    ...emptyPoster,
  };
}

export function isBlankMessageContent(content: string): boolean {
  const text = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return text.length === 0;
}
