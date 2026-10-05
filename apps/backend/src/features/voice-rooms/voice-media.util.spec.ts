import {
  assertKindMatchesMediaTag,
  assertScreenAudioAllowed,
  expectedKindForMediaTag,
  isVideoMediaTag,
  MAX_ROOM_VIDEO_PRODUCERS,
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
  });

  it('maps mediaTag to kind', () => {
    expect(expectedKindForMediaTag('mic')).toBe('audio');
    expect(expectedKindForMediaTag('screen-audio')).toBe('audio');
    expect(expectedKindForMediaTag('cam')).toBe('video');
    expect(expectedKindForMediaTag('screen')).toBe('video');
    expect(isVideoMediaTag('cam')).toBe(true);
    expect(isVideoMediaTag('mic')).toBe(false);
  });

  it('rejects mismatched kind and mediaTag', () => {
    expect(() => assertKindMatchesMediaTag('audio', 'cam')).toThrow(
      /Invalid kind/,
    );
    expect(() => assertKindMatchesMediaTag('video', 'mic')).toThrow(
      /Invalid kind/,
    );
    expect(() => assertKindMatchesMediaTag('video', 'cam')).not.toThrow();
  });

  it('requires screen producer for screen-audio', () => {
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
