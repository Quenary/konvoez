import { describe, expect, it } from 'vitest';
import {
  ChatTarget,
  chatTargetsEqual,
  chatTargetToApiIds,
  messageBelongsToChat,
} from './chat-target';

describe('chat-target helpers', () => {
  it.each([
    {
      description: 'both are null',
      a: null,
      b: null,
      expected: true,
    },
    {
      description: 'same room targets',
      a: { kind: 'room' as const, id: 1 },
      b: { kind: 'room' as const, id: 1 },
      expected: true,
    },
    {
      description: 'different room ids',
      a: { kind: 'room' as const, id: 1 },
      b: { kind: 'room' as const, id: 2 },
      expected: false,
    },
    {
      description: 'different kinds',
      a: { kind: 'room' as const, id: 1 },
      b: { kind: 'direct' as const, id: 1 },
      expected: false,
    },
  ])('compares chat targets ($description)', ({ a, b, expected }) => {
    expect(chatTargetsEqual(a, b)).toBe(expected);
  });

  it.each([
    {
      description: 'null target',
      target: null,
      expected: { roomId: null, recipientId: null },
    },
    {
      description: 'room target',
      target: { kind: 'room' as const, id: 4 },
      expected: { roomId: 4, recipientId: null },
    },
    {
      description: 'direct target',
      target: { kind: 'direct' as const, id: 9 },
      expected: { roomId: null, recipientId: 9 },
    },
  ])('maps $description to api ids', ({ target, expected }) => {
    expect(chatTargetToApiIds(target)).toEqual(expected);
  });

  describe('messageBelongsToChat', () => {
    it.each([
      {
        scenario: 'matches room message to room target',
        message: { roomId: 4, recipientId: null, senderId: 1 },
        target: { kind: 'room' as const, id: 4 },
        currentUserId: undefined,
        expected: true,
      },
      {
        scenario: 'matches direct message by recipientId without currentUserId',
        message: { roomId: null, recipientId: 9, senderId: 1 },
        target: { kind: 'direct' as const, id: 9 },
        currentUserId: undefined,
        expected: true,
      },
      {
        scenario: 'matches direct message by senderId without currentUserId',
        message: { roomId: null, recipientId: 1, senderId: 9 },
        target: { kind: 'direct' as const, id: 9 },
        currentUserId: undefined,
        expected: true,
      },
      {
        scenario: 'does not match room message to direct target',
        message: { roomId: 4, recipientId: null, senderId: 1 },
        target: { kind: 'direct' as const, id: 9 },
        currentUserId: undefined,
        expected: false,
      },
      {
        scenario: 'does not match message when target is null',
        message: { roomId: 4, recipientId: null, senderId: 1 },
        target: null,
        currentUserId: undefined,
        expected: false,
      },
      {
        scenario: 'matches self message to saved messages target',
        message: { roomId: null, recipientId: 1, senderId: 1 },
        target: { kind: 'direct' as const, id: 1 },
        currentUserId: 1,
        expected: true,
      },
      {
        scenario: 'rejects message from another user in saved messages',
        message: { roomId: null, recipientId: 1, senderId: 2 },
        target: { kind: 'direct' as const, id: 1 },
        currentUserId: 1,
        expected: false,
      },
      {
        scenario: 'rejects message to another user in saved messages',
        message: { roomId: null, recipientId: 2, senderId: 1 },
        target: { kind: 'direct' as const, id: 1 },
        currentUserId: 1,
        expected: false,
      },
      {
        scenario: 'matches outgoing direct message to other user target',
        message: { roomId: null, recipientId: 2, senderId: 1 },
        target: { kind: 'direct' as const, id: 2 },
        currentUserId: 1,
        expected: true,
      },
      {
        scenario: 'matches incoming direct message from other user target',
        message: { roomId: null, recipientId: 1, senderId: 2 },
        target: { kind: 'direct' as const, id: 2 },
        currentUserId: 1,
        expected: true,
      },
      {
        scenario: 'rejects self message in chat with another user',
        message: { roomId: null, recipientId: 1, senderId: 1 },
        target: { kind: 'direct' as const, id: 2 },
        currentUserId: 1,
        expected: false,
      },
      {
        scenario: 'rejects third-party message in chat with another user',
        message: { roomId: null, recipientId: 1, senderId: 3 },
        target: { kind: 'direct' as const, id: 2 },
        currentUserId: 1,
        expected: false,
      },
    ] satisfies {
      scenario: string;
      message: {
        roomId: number | null;
        recipientId: number | null;
        senderId: number;
      };
      target: ChatTarget | null;
      currentUserId?: number;
      expected: boolean;
    }[])('$scenario', ({ message, target, currentUserId, expected }) => {
      expect(messageBelongsToChat(message, target, currentUserId)).toBe(
        expected,
      );
    });
  });
});
