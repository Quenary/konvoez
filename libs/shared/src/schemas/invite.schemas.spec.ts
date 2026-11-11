import { describe, it, expect } from 'vitest';
import { inviteCreateSchema, inviteSchema } from './invite.schemas';
import { inviteDefaultTtl } from '../const';

describe('invite.schemas', () => {
  describe('inviteCreateSchema', () => {
    it('applies defaults for ttl and sendEmail', () => {
      const parsed = inviteCreateSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.ttl).toBe(inviteDefaultTtl);
        expect(parsed.data.sendEmail).toBe(false);
        expect(parsed.data.email).toBeUndefined();
      }
    });

    it('parses valid email with sendEmail: true', () => {
      const parsed = inviteCreateSchema.safeParse({
        email: 'user@example.com',
        sendEmail: true,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.email).toBe('user@example.com');
        expect(parsed.data.sendEmail).toBe(true);
      }
    });

    it('allows sendEmail: false explicitly', () => {
      const parsed = inviteCreateSchema.safeParse({
        email: 'user@example.com',
        sendEmail: false,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.sendEmail).toBe(false);
      }
    });

    it('fails when email is invalid format', () => {
      const parsed = inviteCreateSchema.safeParse({
        email: 'not-an-email',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('inviteSchema', () => {
    const validInvite = {
      id: 1,
      code: 'abcdef1234567890abcdef1234567890',
      email: 'user@example.com',
      author: {
        id: 10,
        username: 'admin',
        fullname: 'Administrator',
      },
      expiresAt: new Date().toISOString(),
      usedAt: null,
      usedBy: null,
      revokedAt: null,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    it('defaults emailSent to false when omitted', () => {
      const parsed = inviteSchema.safeParse(validInvite);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.emailSent).toBe(false);
        expect(parsed.data.emailSentAt).toBeUndefined();
      }
    });

    it('validates invite with emailSent: true and emailSentAt date', () => {
      const sentDate = new Date('2026-11-08T03:00:00Z');
      const parsed = inviteSchema.safeParse({
        ...validInvite,
        emailSent: true,
        emailSentAt: sentDate.toISOString(),
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.emailSent).toBe(true);
        expect(parsed.data.emailSentAt).toEqual(sentDate);
      }
    });

    it('validates invite with emailSent: false and emailSentAt: null', () => {
      const parsed = inviteSchema.safeParse({
        ...validInvite,
        emailSent: false,
        emailSentAt: null,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.emailSent).toBe(false);
        expect(parsed.data.emailSentAt).toBeNull();
      }
    });

    it('validates invite with url', () => {
      const parsed = inviteSchema.safeParse({
        ...validInvite,
        url: 'https://konvoez.example.com/auth/register?code=abcdef1234567890abcdef1234567890',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.url).toBe(
          'https://konvoez.example.com/auth/register?code=abcdef1234567890abcdef1234567890',
        );
      }
    });

    it('requires a code while the invite is active', () => {
      const parsed = inviteSchema.safeParse({
        ...validInvite,
        code: undefined,
      });
      expect(parsed.success).toBe(false);
    });

    it.each(['used', 'revoked', 'expired'] as const)(
      'accepts a %s invite without a code or url',
      (status) => {
        const parsed = inviteSchema.safeParse({
          ...validInvite,
          status,
          code: undefined,
          url: undefined,
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.code).toBeUndefined();
          expect(parsed.data.url).toBeUndefined();
        }
      },
    );

    it.each(['used', 'revoked', 'expired'] as const)(
      'rejects a code or url on a %s invite',
      (status) => {
        expect(
          inviteSchema.safeParse({
            ...validInvite,
            status,
            url: undefined,
          }).success,
        ).toBe(false);
        expect(
          inviteSchema.safeParse({
            ...validInvite,
            status,
            code: undefined,
            url: 'https://konvoez.example.com/auth/register?code=secret',
          }).success,
        ).toBe(false);
      },
    );
  });
});
