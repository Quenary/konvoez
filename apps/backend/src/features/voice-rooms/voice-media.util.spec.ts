import { AppException } from '@shared/errors/app.exception';
import {
  assertKindMatchesMediaTag,
  assertKnownMediaTag,
  assertProducedVideoCodec,
  assertScreenAudioAllowed,
  expectedKindForMediaTag,
  isVideoMediaTag,
  MAX_ROOM_VIDEO_PRODUCERS,
  readProducedVideoCodec,
  svcPreferredTemporalLayer,
  svcSpatialLayerCount,
  videoLayersMatchEncodings,
  VOICE_ROOM_MEDIA_CODECS,
} from './voice-media.util';

describe('voice-media.util', () => {
  it('registers Opus and VP8/H264/VP9/AV1', () => {
    const mimeTypes = VOICE_ROOM_MEDIA_CODECS.map((c) => c.mimeType).sort();
    expect(mimeTypes).toEqual(
      [
        'audio/opus',
        'video/AV1',
        'video/H264',
        'video/VP8',
        'video/VP9',
      ].sort(),
    );
    const h264 = VOICE_ROOM_MEDIA_CODECS.find(
      (c) => c.mimeType === 'video/H264',
    );
    expect(h264?.parameters?.['packetization-mode']).toBe(1);
    expect(h264?.parameters?.['profile-level-id']).toBe('42e01f');
    for (const codec of VOICE_ROOM_MEDIA_CODECS) {
      if (codec.kind !== 'video') {
        continue;
      }
      expect(codec.parameters?.['x-google-start-bitrate']).toBe(2500);
    }
  });

  it.each([
    ['L2T3_KEY', 2],
    ['L3T3_KEY', 2],
    ['L1T3', 2],
    ['L2T1', 0],
    [undefined, 2],
  ] as const)('temporal layer for %s is %s', (mode, temporal) => {
    expect(svcPreferredTemporalLayer(mode)).toBe(temporal);
  });

  it.each([
    ['L1T3', 1],
    ['L2T3_KEY', 2],
    ['L3T3_KEY', 3],
    ['S2T3', 2],
    [undefined, undefined],
    ['L1T1', 1],
  ] as const)('spatial count for %s is %s', (mode, spatial) => {
    expect(svcSpatialLayerCount(mode)).toBe(spatial);
  });

  it.each([
    [2, [{ scalabilityMode: 'L2T3_KEY' }], true],
    [3, [{ scalabilityMode: 'L3T3_KEY' }], true],
    [1, [{ scalabilityMode: 'L1T3' }], true],
    [2, [{ scalabilityMode: 'L3T3_KEY' }], false],
    [2, [{}], false],
    [2, [{}, {}], true],
    [3, [{ scalabilityMode: 'L1T1' }, { scalabilityMode: 'L1T1' }], false],
  ] as const)(
    'layer count %s matches encodings %j: %s',
    (layerCount, encodings, matches) => {
      expect(videoLayersMatchEncodings(layerCount, encodings)).toBe(matches);
    },
  );

  it('reads H264, VP8, VP9 and AV1 and rejects other video codecs', () => {
    expect(
      readProducedVideoCodec({
        codecs: [{ mimeType: 'audio/opus' }, { mimeType: 'video/VP9' }],
      }),
    ).toBe('vp9');
    expect(
      readProducedVideoCodec({ codecs: [{ mimeType: 'video/H264' }] }),
    ).toBe('h264');
    expect(
      readProducedVideoCodec({ codecs: [{ mimeType: 'video/H265' }] }),
    ).toBeNull();
    expect(assertProducedVideoCodec('mic', {})).toBeUndefined();
    expect(() =>
      assertProducedVideoCodec('cam', { codecs: [{ mimeType: 'video/H265' }] }),
    ).toThrow(AppException);
    expect(
      assertProducedVideoCodec('screen', {
        codecs: [{ mimeType: 'video/AV1' }],
      }),
    ).toBe('av1');
  });

  it('maps mediaTag to kind', () => {
    expect(expectedKindForMediaTag('mic')).toBe('audio');
    expect(expectedKindForMediaTag('screen-audio')).toBe('audio');
    expect(expectedKindForMediaTag('cam')).toBe('video');
    expect(expectedKindForMediaTag('screen')).toBe('video');
    expect(isVideoMediaTag('cam')).toBe(true);
    expect(isVideoMediaTag('mic')).toBe(false);
  });

  it('rejects unknown mediaTag and invalid kind with AppException', () => {
    expect(() => assertKnownMediaTag('webcam', 'video')).toThrow(AppException);
    expect(() => assertKnownMediaTag('webcam', 'video')).toThrow(
      /Unknown mediaTag/,
    );
    expect(() => assertKnownMediaTag('mic', 'text')).toThrow(AppException);
    expect(() => assertKnownMediaTag('mic', 'text')).toThrow(/Invalid kind/);
    expect(() => assertKnownMediaTag('mic', 'audio')).not.toThrow();
  });

  it('rejects mismatched kind and mediaTag with AppException', () => {
    expect(() => assertKindMatchesMediaTag('audio', 'cam')).toThrow(
      AppException,
    );
    expect(() => assertKindMatchesMediaTag('audio', 'cam')).toThrow(
      /Invalid kind/,
    );
    expect(() => assertKindMatchesMediaTag('video', 'mic')).toThrow(
      AppException,
    );
    expect(() => assertKindMatchesMediaTag('video', 'mic')).toThrow(
      /Invalid kind/,
    );
    expect(() => assertKindMatchesMediaTag('video', 'cam')).not.toThrow();
  });

  it('requires screen producer for screen-audio with AppException', () => {
    expect(() => assertScreenAudioAllowed('screen-audio', false)).toThrow(
      AppException,
    );
    expect(() => assertScreenAudioAllowed('screen-audio', false)).toThrow(
      /screen-audio requires/,
    );
    expect(() => assertScreenAudioAllowed('screen-audio', true)).not.toThrow();
    expect(() => assertScreenAudioAllowed('mic', false)).not.toThrow();
  });

  it('exposes room video producer limit', () => {
    expect(MAX_ROOM_VIDEO_PRODUCERS).toBe(4);
  });
});
