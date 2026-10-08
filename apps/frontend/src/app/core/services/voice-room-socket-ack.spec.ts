import { describe, expect, it, vi } from 'vitest';
import { emitVoiceRoomWithAck } from './voice-room-socket-ack';

describe('emitVoiceRoomWithAck', () => {
  it('rejects when the server returns an error payload', async () => {
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
