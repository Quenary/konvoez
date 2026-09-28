import {
  EVoiceSessionType,
  getDirectCallIdFromSessionKey,
  getGroupRoomIdFromSessionKey,
  getVoiceSessionKey,
  parseVoiceSessionKey,
} from '@konvoez/shared';

describe('voice session key helpers', () => {
  it('round-trips group room keys', () => {
    const target = {
      type: EVoiceSessionType.GROUP_ROOM as const,
      roomId: 42,
    };
    const key = getVoiceSessionKey(target);
    expect(key).toBe('room:42');
    expect(parseVoiceSessionKey(key)).toEqual(target);
    expect(getGroupRoomIdFromSessionKey(key)).toBe(42);
  });

  it('round-trips direct call keys', () => {
    const target = {
      type: EVoiceSessionType.DIRECT_CALL as const,
      callId: 'abc-123',
    };
    const key = getVoiceSessionKey(target);
    expect(key).toBe('call:abc-123');
    expect(parseVoiceSessionKey(key)).toEqual(target);
    expect(getDirectCallIdFromSessionKey(key)).toBe('abc-123');
  });

  it('returns null for invalid keys', () => {
    expect(parseVoiceSessionKey('foo')).toBeNull();
    expect(parseVoiceSessionKey('room:')).toBeNull();
    expect(parseVoiceSessionKey('room:abc')).toBeNull();
    expect(parseVoiceSessionKey('call:')).toBeNull();
  });
});
