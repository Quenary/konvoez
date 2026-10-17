import { messageReactionToggleSchema } from '@konvoez/shared';
import { TextRoomJoinDto, ToggleReactionDto } from './text-rooms.dto';

describe('TextRoomJoinDto', () => {
  it('should accept positive integer roomId', () => {
    const parsed = TextRoomJoinDto.schema.safeParse({ roomId: 42 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.roomId).toBe(42);
    }
  });

  it('should reject non-positive or invalid roomId and recipientId', () => {
    expect(TextRoomJoinDto.schema.safeParse({ roomId: 0 }).success).toBe(false);
    expect(TextRoomJoinDto.schema.safeParse({ roomId: -1 }).success).toBe(
      false,
    );
    expect(TextRoomJoinDto.schema.safeParse({ roomId: 1.5 }).success).toBe(
      false,
    );
    expect(TextRoomJoinDto.schema.safeParse({ roomId: 'abc' }).success).toBe(
      false,
    );
    expect(TextRoomJoinDto.schema.safeParse({ recipientId: -2 }).success).toBe(
      false,
    );
    expect(
      TextRoomJoinDto.schema.safeParse({ recipientId: 'xyz' }).success,
    ).toBe(false);
  });
});

describe('messageReactionToggleSchema & ToggleReactionDto', () => {
  it('should accept valid standard, modifier, compound, and flag emojis', () => {
    const validEmojis = [
      '👍',
      '❤️',
      '🔥',
      '🎉',
      '🚀',
      '😂',
      '💩',
      '👀',
      '👍🏻',
      '👨‍👩‍👧‍👦',
      '🧑‍💻',
      '🇷🇺',
      '🇺🇸',
    ];

    for (const emoji of validEmojis) {
      const parsed = messageReactionToggleSchema.safeParse({ emoji });
      expect(parsed.success).toBe(true);
      expect(new ToggleReactionDto()).toBeDefined();
    }
  });

  it('should reject invalid non-emoji text and strings', () => {
    const invalidInputs = [
      'hello',
      '123',
      '',
      ' ',
      '👍 hello',
      'hello 👍',
      '👍123',
      '\uFE0F',
      '\u200D',
      '<script>alert(1)</script>',
      'a'.repeat(33),
    ];

    for (const emoji of invalidInputs) {
      const parsed = messageReactionToggleSchema.safeParse({ emoji });
      expect(parsed.success).toBe(false);
    }
  });
});
