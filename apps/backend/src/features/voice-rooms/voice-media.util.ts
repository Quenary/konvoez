import { TVoiceRoomMediaTag } from '@konvoez/shared';
import { WsException } from '@nestjs/websockets';
import type { RtpCodecCapability } from 'mediasoup/types';

export const MAX_ROOM_VIDEO_PRODUCERS = 4;

/**
 * Router codecs: Opus + VP8/H264/VP9/AV1.
 * MVP senders pick VP8 explicitly; other video codecs stay for later negotiate/auto.
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
      'x-google-start-bitrate': 1000,
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
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    preferredPayloadType: 98,
    parameters: {
      'profile-id': 2,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/AV1',
    clockRate: 90000,
    preferredPayloadType: 99,
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
    throw new WsException(
      `Invalid kind "${String(kind)}" (expected "audio" or "video")`,
    );
  }
  if (
    typeof mediaTag !== 'string' ||
    !(KNOWN_MEDIA_TAGS as readonly string[]).includes(mediaTag)
  ) {
    throw new WsException(`Unknown mediaTag "${String(mediaTag)}"`);
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
    throw new WsException(
      `Invalid kind "${kind}" for mediaTag "${mediaTag}" (expected "${expected}")`,
    );
  }
}

export function assertScreenAudioAllowed(
  mediaTag: TVoiceRoomMediaTag,
  hasScreenProducer: boolean,
): void {
  if (mediaTag === 'screen-audio' && !hasScreenProducer) {
    throw new WsException('screen-audio requires an active screen producer');
  }
}
