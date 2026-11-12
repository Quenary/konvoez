import { describe, expect, it } from 'vitest';
import { roomCreateSchema, roomUpdateSchema } from './room.schemas';
import { ERoomType } from '../enums';

describe('room schemas avatar validation', () => {
  it('accepts valid room avatar keys', () => {
    expect(() =>
      roomCreateSchema.parse({
        name: 'General',
        type: ERoomType.TEXT,
        avatar: 'rooms-avatars/1731383049123-avatar.webp',
      }),
    ).not.toThrow();

    expect(() =>
      roomCreateSchema.parse({
        name: 'General',
        type: ERoomType.TEXT,
        avatar: 'room-avatar.webp',
      }),
    ).not.toThrow();

    expect(() =>
      roomUpdateSchema.parse({
        avatar: null,
      }),
    ).not.toThrow();

    expect(() =>
      roomUpdateSchema.parse({
        avatar: 'rooms-avatars/1731383049123-avatar.webp',
      }),
    ).not.toThrow();
  });

  it('rejects path traversal and cross-bucket avatar keys', () => {
    expect(() =>
      roomCreateSchema.parse({
        name: 'General',
        type: ERoomType.TEXT,
        avatar: '../evil.png',
      }),
    ).toThrow();

    expect(() =>
      roomCreateSchema.parse({
        name: 'General',
        type: ERoomType.TEXT,
        avatar: 'rooms-avatars/../message-attachments/secret.pdf',
      }),
    ).toThrow();

    expect(() =>
      roomCreateSchema.parse({
        name: 'General',
        type: ERoomType.TEXT,
        avatar: 'users-avatars/user.webp',
      }),
    ).toThrow();

    expect(() =>
      roomUpdateSchema.parse({
        avatar: 'message-attachments/secret.pdf',
      }),
    ).toThrow();
  });
});
