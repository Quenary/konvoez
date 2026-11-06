import { TStreamVideoCodec } from '@konvoez/shared';

const BASE_VIDEO_CODECS = [
  'vp9',
  'vp8',
] as const satisfies readonly TStreamVideoCodec[];

function hasMime(mimes: readonly string[], codec: TStreamVideoCodec): boolean {
  const mime = `video/${codec}`;
  return mimes.some((item) => item.toLowerCase() === mime);
}

function bothCanUse(
  codec: TStreamVideoCodec,
  senderMimes: readonly string[],
  deviceMimes: readonly string[] | null,
): boolean {
  return (
    deviceMimes != null &&
    hasMime(senderMimes, codec) &&
    hasMime(deviceMimes, codec)
  );
}

/** Best quality first. VP9 and VP8 are always offered. AV1 and H.264 require both the sender and the device. */
export function availableVideoCodecs(input: {
  senderMimes: readonly string[];
  deviceMimes: readonly string[] | null;
}): TStreamVideoCodec[] {
  const codecs: TStreamVideoCodec[] = [];
  if (bothCanUse('av1', input.senderMimes, input.deviceMimes)) {
    codecs.push('av1');
  }
  if (bothCanUse('h264', input.senderMimes, input.deviceMimes)) {
    codecs.push('h264');
  }
  codecs.push(...BASE_VIDEO_CODECS);
  return codecs;
}

export function deviceCanReceiveCodec(
  deviceMimes: readonly string[],
  codec: TStreamVideoCodec,
): boolean {
  return hasMime(deviceMimes, codec);
}
