import {
  INLINE_AUDIO_MIMES,
  INLINE_IMAGE_MIMES,
  INLINE_VIDEO_MIMES,
} from './const';
import { EAttachmentKind } from './enums';

/**
 * Classifies an attachment into an EAttachmentKind based on its MIME type.
 * Ensures consistent classification between backend and frontend.
 */
export function classifyAttachmentKind(
  mime: string | null | undefined,
): EAttachmentKind {
  if (!mime) {
    return EAttachmentKind.FILE;
  }
  const normalized = mime.toLowerCase().trim();
  if ((INLINE_IMAGE_MIMES as readonly string[]).includes(normalized)) {
    return EAttachmentKind.IMAGE;
  }
  if ((INLINE_VIDEO_MIMES as readonly string[]).includes(normalized)) {
    return EAttachmentKind.VIDEO;
  }
  if (
    normalized.startsWith('audio/') ||
    (INLINE_AUDIO_MIMES as readonly string[]).includes(normalized)
  ) {
    return EAttachmentKind.AUDIO;
  }
  return EAttachmentKind.FILE;
}
