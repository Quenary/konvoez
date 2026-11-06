import { describe, expect, it } from 'vitest';
import { availableVideoCodecs, deviceCanReceiveCodec } from './video-codec';

describe('availableVideoCodecs', () => {
  it('hides H.264 and AV1 unless both the sender and the device can use them', () => {
    expect(
      availableVideoCodecs({
        senderMimes: ['video/VP8', 'video/VP9', 'video/AV1', 'video/H264'],
        deviceMimes: ['video/VP8', 'video/VP9'],
      }),
    ).toEqual(['vp9', 'vp8']);
    expect(
      availableVideoCodecs({
        senderMimes: ['video/H264', 'video/VP8', 'video/VP9', 'video/AV1'],
        deviceMimes: ['video/H264', 'video/VP8', 'video/VP9', 'video/AV1'],
      }),
    ).toEqual(['av1', 'h264', 'vp9', 'vp8']);
    expect(
      availableVideoCodecs({
        senderMimes: ['video/AV1', 'video/H264'],
        deviceMimes: null,
      }),
    ).toEqual(['vp9', 'vp8']);
  });
});

describe('deviceCanReceiveCodec', () => {
  it('matches the mime type ignoring case', () => {
    expect(deviceCanReceiveCodec(['video/VP9'], 'vp9')).toBe(true);
    expect(deviceCanReceiveCodec(['video/VP8'], 'av1')).toBe(false);
  });
});
