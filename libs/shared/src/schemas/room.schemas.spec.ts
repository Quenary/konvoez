import { describe, expect, it } from 'vitest';
import {
  roomCreateSchema,
  roomReorderSchema,
  roomSchema,
  roomUpdateSchema,
} from './room.schemas';
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
      roomCreateSchema.parse({
        name: 'General',
        type: ERoomType.TEXT,
        avatar: null,
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

  it('validates room order and reorder schema', () => {
    const parsedRoom = roomSchema.parse({
      id: 1,
      name: 'General',
      type: ERoomType.TEXT,
      author: { id: 1, username: 'alice', fullname: 'Alice' },
      createdAt: new Date(),
      updatedAt: null,
    });
    expect(parsedRoom.order).toBe(0);

    const parsedCustomOrder = roomCreateSchema.parse({
      name: 'General',
      type: ERoomType.TEXT,
      order: 5,
    });
    expect(parsedCustomOrder.order).toBe(5);

    expect(() =>
      roomReorderSchema.parse({
        roomIds: [1, 2, 3],
      }),
    ).not.toThrow();

    expect(() =>
      roomReorderSchema.parse({
        roomIds: [],
      }),
    ).toThrow();

    expect(() =>
      roomReorderSchema.parse({
        roomIds: [-1],
      }),
    ).toThrow();

    expect(() =>
      roomReorderSchema.parse({
        roomIds: [1, 1, 2],
      }),
    ).toThrow();

    expect(() =>
      roomCreateSchema.parse({
        name: 'General',
        type: ERoomType.TEXT,
        order: -1,
      }),
    ).toThrow();

    expect(() =>
      roomUpdateSchema.parse({
        order: -1,
      }),
    ).toThrow();
  });
});
