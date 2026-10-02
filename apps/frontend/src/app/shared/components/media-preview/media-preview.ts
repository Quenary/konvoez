import { InjectionToken } from '@angular/core';
import { EAttachmentKind } from '@konvoez/shared';

export interface IMediaPreviewItem {
  readonly kind: EAttachmentKind.IMAGE | EAttachmentKind.VIDEO;
  readonly src: string;
  readonly name: string;
  readonly downloadUrl: string | null;
}

export interface IMediaPreviewData {
  readonly items: readonly IMediaPreviewItem[];
  readonly startIndex: number;
}

export const MEDIA_PREVIEW_DATA = new InjectionToken<IMediaPreviewData>(
  'MEDIA_PREVIEW_DATA',
);
