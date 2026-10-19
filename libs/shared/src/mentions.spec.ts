import { describe, expect, it } from 'vitest';
import {
  diffMentionedUsers,
  formatRoleMention,
  formatUserMention,
  MENTION_EVERYONE,
  parseMentions,
  splitMentionSegments,
} from './mentions';

describe('mentions', () => {
  describe('formatters', () => {
    it('formats user mention token', () => {
      expect(formatUserMention(42)).toBe('<@42>');
    });

    it('formats role mention token', () => {
      expect(formatRoleMention(7)).toBe('<@&7>');
    });
  });

  describe('splitMentionSegments and parseMentions', () => {
    it('handles empty string', () => {
      expect(splitMentionSegments('')).toEqual([]);
      expect(parseMentions('')).toEqual({
        userIds: [],
        roleIds: [],
        everyone: false,
      });
    });

    it('handles text without mentions', () => {
      const text = 'Just some plain text here';
      expect(splitMentionSegments(text)).toEqual([
        { type: 'text', value: text },
      ]);
      expect(parseMentions(text)).toEqual({
        userIds: [],
        roleIds: [],
        everyone: false,
      });
    });

    it('handles tokens at start, middle, end and adjacent to punctuation', () => {
      const text = '<@1>! Hello <@&2>, did you see @everyone? Yes, <@3>';
      const segments = splitMentionSegments(text);

      expect(segments).toEqual([
        { type: 'user', id: 1 },
        { type: 'text', value: '! Hello ' },
        { type: 'role', id: 2 },
        { type: 'text', value: ', did you see ' },
        { type: 'everyone' },
        { type: 'text', value: '? Yes, ' },
        { type: 'user', id: 3 },
      ]);

      expect(parseMentions(text)).toEqual({
        userIds: [1, 3],
        roleIds: [2],
        everyone: true,
      });
    });

    it('does not match email addresses with @everyone or words starting with @everyone', () => {
      const text =
        'Contact email@everyone.com or @everyoneX or @@everyone or _@everyone or 1@everyone';
      const segments = splitMentionSegments(text);

      expect(segments).toEqual([{ type: 'text', value: text }]);
      expect(parseMentions(text)).toEqual({
        userIds: [],
        roleIds: [],
        everyone: false,
      });
    });

    it('does not match invalid user or role IDs: <@0>, <@-1>, <@abc>, 11-digit ids', () => {
      const text = '<@0> <@-1> <@abc> <@12345678901> <@&0> <@&-1> <@&xyz>';
      const segments = splitMentionSegments(text);

      expect(segments).toEqual([{ type: 'text', value: text }]);
      expect(parseMentions(text)).toEqual({
        userIds: [],
        roleIds: [],
        everyone: false,
      });
    });

    it('deduplicates and sorts parsed mention IDs', () => {
      const text =
        '<@5> and <@2> also <@5> again, with <@&10> and <@&3> and @everyone and @everyone';
      const parsed = parseMentions(text);

      expect(parsed).toEqual({
        userIds: [2, 5],
        roleIds: [3, 10],
        everyone: true,
      });
    });

    it('correctly handles Cyrillic text around tokens', () => {
      const text =
        'Привет, <@15>! Как дела у <@&4>? Внимание, @everyone! Привет@everyone';
      const segments = splitMentionSegments(text);

      expect(segments).toEqual([
        { type: 'text', value: 'Привет, ' },
        { type: 'user', id: 15 },
        { type: 'text', value: '! Как дела у ' },
        { type: 'role', id: 4 },
        { type: 'text', value: '? Внимание, ' },
        { type: 'everyone' },
        { type: 'text', value: '! Привет@everyone' },
      ]);

      expect(parseMentions(text)).toEqual({
        userIds: [15],
        roleIds: [4],
        everyone: true,
      });
    });

    it('round-trips segments by joining formatted tokens', () => {
      const inputs = [
        '',
        'Just normal text',
        '<@1>',
        '<@&2>',
        '@everyone',
        'Hello <@12>, check <@&3> and @everyone right now!',
        'Какая-то строка с <@999> и <@&888> а также @everyone в конце.',
      ];

      for (const input of inputs) {
        const segments = splitMentionSegments(input);
        const reconstructed = segments
          .map((seg) => {
            if (seg.type === 'text') return seg.value;
            if (seg.type === 'user') return formatUserMention(seg.id);
            if (seg.type === 'role') return formatRoleMention(seg.id);
            if (seg.type === 'everyone') return MENTION_EVERYONE;
          })
          .join('');

        expect(reconstructed).toBe(input);
      }
    });
  });

  describe('diffMentionedUsers', () => {
    it('returns ids in next that are not in prev', () => {
      expect(diffMentionedUsers([1, 2, 3], [2, 3, 4, 5])).toEqual([4, 5]);
    });

    it('returns empty array when no new ids are added', () => {
      expect(diffMentionedUsers([1, 2, 3], [1, 2])).toEqual([]);
    });

    it('deduplicates new ids in next', () => {
      expect(diffMentionedUsers([1], [2, 3, 2, 4, 3])).toEqual([2, 3, 4]);
    });

    it('handles empty arrays', () => {
      expect(diffMentionedUsers([], [1, 2])).toEqual([1, 2]);
      expect(diffMentionedUsers([1, 2], [])).toEqual([]);
    });
  });
});
