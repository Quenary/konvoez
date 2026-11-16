import { describe, expect, it } from 'vitest';
import { profileUpdateSchema } from './profile.schemas';

describe('profileUpdateSchema avatar validation', () => {
  it('accepts valid avatar keys', () => {
    expect(() =>
      profileUpdateSchema.parse({
        avatar: 'users-avatars/1731383049123-photo.webp',
      }),
    ).not.toThrow();
    expect(() =>
      profileUpdateSchema.parse({ avatar: 'avatar.png' }),
    ).not.toThrow();
    expect(() =>
      profileUpdateSchema.parse({ avatar: 'avatar_key' }),
    ).not.toThrow();
    expect(() => profileUpdateSchema.parse({ avatar: null })).not.toThrow();
    expect(() =>
      profileUpdateSchema.parse({ avatar: undefined }),
    ).not.toThrow();
  });

  it('rejects path traversal and cross-bucket avatar keys', () => {
    expect(() =>
      profileUpdateSchema.parse({ avatar: '../evil.png' }),
    ).toThrow();
    expect(() =>
      profileUpdateSchema.parse({
        avatar: 'users-avatars/../message-attachments/secret.pdf',
      }),
    ).toThrow();
    expect(() =>
      profileUpdateSchema.parse({ avatar: 'rooms-avatars/room.webp' }),
    ).toThrow();
    expect(() =>
      profileUpdateSchema.parse({
        avatar: 'message-attachments/secret.pdf',
      }),
    ).toThrow();
    expect(() =>
      profileUpdateSchema.parse({ avatar: '/etc/passwd' }),
    ).toThrow();
  });

  it('validates language field in profileUpdateSchema', () => {
    expect(() => profileUpdateSchema.parse({ language: 'en' })).not.toThrow();
    expect(() => profileUpdateSchema.parse({ language: 'ru' })).not.toThrow();
    expect(() => profileUpdateSchema.parse({ language: null })).not.toThrow();
    expect(() =>
      profileUpdateSchema.parse({ language: undefined }),
    ).not.toThrow();
    expect(() =>
      profileUpdateSchema.parse({ language: 'unsupported' }),
    ).toThrow();
  });
});
