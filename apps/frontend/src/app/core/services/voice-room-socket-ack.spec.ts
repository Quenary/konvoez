import { describe, expect, it, vi } from 'vitest';
import { ApiErrorCode } from '@konvoez/shared';
import { ApiAckError, emitVoiceRoomWithAck } from './voice-room-socket-ack';

describe('emitVoiceRoomWithAck', () => {
  it('rejects with ApiAckError when the server returns a structured TApiErrorResponse', async () => {
    const errorPayload = {
      code: ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED,
      message: 'Room video producer limit reached',
    };
    const emitWithAck = vi.fn().mockResolvedValue({ error: errorPayload });
    const socket = {
      timeout: vi.fn().mockReturnValue({ emitWithAck }),
    };

    await expect(
      emitVoiceRoomWithAck(socket as never, 'produce', { kind: 'video' }),
    ).rejects.toThrow(ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED);

    try {
      await emitVoiceRoomWithAck(socket as never, 'produce', { kind: 'video' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiAckError);
      expect((err as ApiAckError).apiError).toEqual(errorPayload);
    }
  });

  it('rejects when the server returns a legacy string error payload', async () => {
    const emitWithAck = vi
      .fn()
      .mockResolvedValue({ error: 'Producer not found' });
    const socket = {
      timeout: vi.fn().mockReturnValue({ emitWithAck }),
    };

    await expect(
      emitVoiceRoomWithAck(socket as never, 'close-producer', {
        producerId: 'p1',
      }),
    ).rejects.toThrow('Producer not found');
    expect(socket.timeout).toHaveBeenCalledWith(5000);
  });

  it('returns the ack payload on success', async () => {
    const payload = { epoch: 'e1', revision: 0, rooms: {} };
    const emitWithAck = vi.fn().mockResolvedValue(payload);
    const socket = {
      timeout: vi.fn().mockReturnValue({ emitWithAck }),
    };

    await expect(
      emitVoiceRoomWithAck(socket as never, 'get-all-peers'),
    ).resolves.toEqual(payload);
  });
});
