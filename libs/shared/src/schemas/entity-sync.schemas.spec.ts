import { describe, expect, it } from 'vitest';
import {
  userPresenceChangedSchema,
  userPresenceSnapshotSchema,
} from './entity-sync.schemas';

describe('EntitySync Schemas', () => {
  describe('userPresenceChangedSchema', () => {
    it('accepts valid presence change payload', () => {
      const parsed = userPresenceChangedSchema.safeParse({
        userId: 42,
        isOnline: true,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.userId).toBe(42);
        expect(parsed.data.isOnline).toBe(true);
      }
    });

    it('rejects invalid presence change payload', () => {
      expect(
        userPresenceChangedSchema.safeParse({
          userId: 'invalid',
          isOnline: true,
        }).success,
      ).toBe(false);

      expect(
        userPresenceChangedSchema.safeParse({
          userId: 42,
          isOnline: 'yes',
        }).success,
      ).toBe(false);

      expect(
        userPresenceChangedSchema.safeParse({
          userId: 42.5,
          isOnline: true,
        }).success,
      ).toBe(false);
    });
  });

  describe('userPresenceSnapshotSchema', () => {
    it('accepts valid presence snapshot payload', () => {
      const parsed = userPresenceSnapshotSchema.safeParse({
        userIds: [1, 2, 3],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.userIds).toEqual([1, 2, 3]);
      }
    });

    it('accepts empty presence snapshot', () => {
      const parsed = userPresenceSnapshotSchema.safeParse({
        userIds: [],
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid presence snapshot', () => {
      expect(
        userPresenceSnapshotSchema.safeParse({
          userIds: ['1', '2'],
        }).success,
      ).toBe(false);

      expect(
        userPresenceSnapshotSchema.safeParse({
          userIds: null,
        }).success,
      ).toBe(false);
    });
  });
});
