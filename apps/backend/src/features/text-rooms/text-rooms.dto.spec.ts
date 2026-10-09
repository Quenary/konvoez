import { messageReactionToggleSchema } from '@konvoez/shared';
import { ToggleReactionDto } from './text-rooms.dto';

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
