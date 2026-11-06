import {
  ApiErrorCode,
  TStreamVideoCodec,
  TVoiceRoomMediaTag,
} from '@konvoez/shared';
import type { RtpCodecCapability } from 'mediasoup/types';
import { AppException } from '@shared/errors/app.exception';

export const MAX_ROOM_VIDEO_PRODUCERS = 4;

/** Initial encoder bitrate hint, in kbit/s. Not a cap. */
const VIDEO_START_BITRATE_KBPS = 2500;

/**
 * Router codecs: Opus + VP8/H264/VP9/AV1.
 * Camera and screen producers must use H264, VP8, VP9 or AV1.
 */
export const VOICE_ROOM_MEDIA_CODECS: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    preferredPayloadType: 96,
    parameters: {
      'x-google-start-bitrate': VIDEO_START_BITRATE_KBPS,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    preferredPayloadType: 97,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': VIDEO_START_BITRATE_KBPS,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    preferredPayloadType: 98,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': VIDEO_START_BITRATE_KBPS,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/AV1',
    clockRate: 90000,
    preferredPayloadType: 99,
    parameters: {
      'x-google-start-bitrate': VIDEO_START_BITRATE_KBPS,
    },
  },
];

const KNOWN_MEDIA_TAGS: readonly TVoiceRoomMediaTag[] = [
  'mic',
  'cam',
  'screen',
  'screen-audio',
];

export function assertKnownMediaTag(
  mediaTag: unknown,
  kind: unknown,
): asserts mediaTag is TVoiceRoomMediaTag {
  if (kind !== 'audio' && kind !== 'video') {
    throw AppException.badRequest(
      ApiErrorCode.VOICE_MEDIA_INVALID,
      `Invalid kind "${String(kind)}" (expected "audio" or "video")`,
    );
  }
  if (
    typeof mediaTag !== 'string' ||
    !(KNOWN_MEDIA_TAGS as readonly string[]).includes(mediaTag)
  ) {
    throw AppException.badRequest(
      ApiErrorCode.VOICE_MEDIA_INVALID,
      `Unknown mediaTag "${String(mediaTag)}"`,
    );
  }
}

export function isVideoMediaTag(mediaTag: TVoiceRoomMediaTag): boolean {
  return mediaTag === 'cam' || mediaTag === 'screen';
}

export function expectedKindForMediaTag(
  mediaTag: TVoiceRoomMediaTag,
): 'audio' | 'video' {
  return isVideoMediaTag(mediaTag) ? 'video' : 'audio';
}

export function assertKindMatchesMediaTag(
  kind: 'audio' | 'video',
  mediaTag: TVoiceRoomMediaTag,
): void {
  const expected = expectedKindForMediaTag(mediaTag);
  if (kind !== expected) {
    throw AppException.badRequest(
      ApiErrorCode.VOICE_MEDIA_INVALID,
      `Invalid kind "${kind}" for mediaTag "${mediaTag}" (expected "${expected}")`,
    );
  }
}

const PRODUCED_VIDEO_CODECS: Record<string, TStreamVideoCodec> = {
  'video/h264': 'h264',
  'video/vp8': 'vp8',
  'video/vp9': 'vp9',
  'video/av1': 'av1',
};

/** First video codec in mediasoup RTP parameters, or null when it is not allowed. */
export function readProducedVideoCodec(
  rtpParameters: unknown,
): TStreamVideoCodec | null {
  if (typeof rtpParameters !== 'object' || rtpParameters === null) {
    return null;
  }
  const codecs = (rtpParameters as { codecs?: unknown }).codecs;
  if (!Array.isArray(codecs)) {
    return null;
  }
  for (const entry of codecs) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const mimeType = (entry as { mimeType?: unknown }).mimeType;
    if (typeof mimeType !== 'string') {
      continue;
    }
    const mime = mimeType.toLowerCase();
    if (!mime.startsWith('video/')) {
      continue;
    }
    return PRODUCED_VIDEO_CODECS[mime] ?? null;
  }
  return null;
}

export function assertProducedVideoCodec(
  mediaTag: TVoiceRoomMediaTag,
  rtpParameters: unknown,
): TStreamVideoCodec | undefined {
  if (!isVideoMediaTag(mediaTag)) {
    return undefined;
  }
  const codec = readProducedVideoCodec(rtpParameters);
  if (!codec) {
    throw AppException.badRequest(
      ApiErrorCode.VOICE_MEDIA_INVALID,
      'Unsupported video codec',
    );
  }
  return codec;
}

export function assertScreenAudioAllowed(
  mediaTag: TVoiceRoomMediaTag,
  hasScreenProducer: boolean,
): void {
  if (mediaTag === 'screen-audio' && !hasScreenProducer) {
    throw AppException.badRequest(
      ApiErrorCode.VOICE_MEDIA_INVALID,
      'screen-audio requires an active screen producer',
    );
  }
}
