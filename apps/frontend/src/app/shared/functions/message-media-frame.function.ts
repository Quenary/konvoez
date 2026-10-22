import { EAttachmentKind } from '@konvoez/shared';
import {
  IMediaFrameLimit,
  mediaFrameLimit,
} from '@shared/components/media-grid/media-grid.layout';

type MediaSource = {
  kind: EAttachmentKind;
  width?: number | null;
  height?: number | null;
};

type MediaMessage = {
  attachments?: readonly MediaSource[] | null;
  outgoing?: { files: readonly MediaSource[] } | null;
};

function isMedia(source: MediaSource): boolean {
  return (
    source.kind === EAttachmentKind.IMAGE ||
    source.kind === EAttachmentKind.VIDEO
  );
}

function mediaSources(message: MediaMessage): readonly MediaSource[] {
  const sources = message.outgoing
    ? message.outgoing.files
    : (message.attachments ?? []);
  return sources.filter(isMedia);
}

/** Whether the message renders images or videos. */
export function messageHasMedia(message: MediaMessage): boolean {
  return mediaSources(message).length > 0;
}

/**
 * Size limit of the media frame of a message, derived from attachment
 * dimensions so the frame reserves its size before the media loads.
 * Null when there is no media or any media item lacks dimensions.
 */
export function messageMediaFrame(
  message: MediaMessage,
): IMediaFrameLimit | null {
  const sizes: { width: number; height: number }[] = [];
  for (const source of mediaSources(message)) {
    if (!source.width || !source.height) {
      return null;
    }
    sizes.push({ width: source.width, height: source.height });
  }
  return mediaFrameLimit(sizes);
}
