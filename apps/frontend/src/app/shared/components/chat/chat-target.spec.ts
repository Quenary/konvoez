import { describe, expect, it } from 'vitest';
import {
  chatTargetsEqual,
  chatTargetToApiIds,
  messageBelongsToChat,
} from './chat-target';

describe('chat-target helpers', () => {
  it('compares chat targets by kind and id', () => {
    expect(chatTargetsEqual(null, null)).toBe(true);
    expect(
      chatTargetsEqual({ kind: 'room', id: 1 }, { kind: 'room', id: 1 }),
    ).toBe(true);
    expect(
      chatTargetsEqual({ kind: 'room', id: 1 }, { kind: 'room', id: 2 }),
    ).toBe(false);
    expect(
      chatTargetsEqual({ kind: 'room', id: 1 }, { kind: 'direct', id: 1 }),
    ).toBe(false);
  });

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

  it('matches messages with currentUserId for direct and saved messages', () => {
    const currentUserId = 1;

    // Saved messages: target is oneself
    const savedTarget = { kind: 'direct' as const, id: currentUserId };
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 1, senderId: 1 },
        savedTarget,
        currentUserId,
      ),
    ).toBe(true);
    // Someone else messaging current user should NOT belong to saved messages
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 1, senderId: 2 },
        savedTarget,
        currentUserId,
      ),
    ).toBe(false);
    // Current user messaging someone else should NOT belong to saved messages
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 2, senderId: 1 },
        savedTarget,
        currentUserId,
      ),
    ).toBe(false);

    // Direct chat with another user (id: 2)
    const otherTarget = { kind: 'direct' as const, id: 2 };
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 2, senderId: 1 },
        otherTarget,
        currentUserId,
      ),
    ).toBe(true);
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 1, senderId: 2 },
        otherTarget,
        currentUserId,
      ),
    ).toBe(true);
    // Self messages should NOT appear in chat with user 2
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 1, senderId: 1 },
        otherTarget,
        currentUserId,
      ),
    ).toBe(false);
    // Third party messages should NOT appear in chat with user 2
    expect(
      messageBelongsToChat(
        { roomId: null, recipientId: 1, senderId: 3 },
        otherTarget,
        currentUserId,
      ),
    ).toBe(false);
  });
});
