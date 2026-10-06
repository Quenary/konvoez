import { describe, expect, it } from 'vitest';
import { chatTargetToApiIds, messageBelongsToChat } from './chat-target';

describe('chat-target helpers', () => {
  it('maps room and direct targets to api ids', () => {
    expect(chatTargetToApiIds(null)).toEqual({
      roomId: null,
      recipientId: null,
    });
    expect(chatTargetToApiIds({ kind: 'room', id: 4 })).toEqual({
      roomId: 4,
      recipientId: null,
    });
    expect(chatTargetToApiIds({ kind: 'direct', id: 9 })).toEqual({
      roomId: null,
      recipientId: 9,
    });
  });

  it('matches messages to the active chat target', () => {
    expect(
      messageBelongsToChat(
        { roomId: 4, recipientId: null, senderId: 1 },
        { kind: 'room', id: 4 },
      ),
    ).toBe(true);
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 9, senderId: 1 },
        { kind: 'direct', id: 9 },
      ),
    ).toBe(true);
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 1, senderId: 9 },
        { kind: 'direct', id: 9 },
      ),
    ).toBe(true);
    expect(
      messageBelongsToChat(
        { roomId: 4, recipientId: null, senderId: 1 },
        { kind: 'direct', id: 9 },
      ),
    ).toBe(false);
    expect(
      messageBelongsToChat({ roomId: 4, recipientId: null, senderId: 1 }, null),
    ).toBe(false);
  });
});
