import { describe, expect, it } from 'vitest';
import {
  appUrlSettingSchema,
  appUrlSettingValueSchema,
  attachmentsKeepDaysSettingSchema,
  attachmentsKeepDaysSettingValueSchema,
  DEFAULT_APP_URL,
  DEFAULT_ATTACHMENTS_KEEP_DAYS,
  DEFAULT_STREAM_MAX_BITRATE_KBPS,
  DEFAULT_VOICE_MAX_BITRATE_KBPS,
  ESettingKey,
  SCHEMA_ERROR,
  settingItemUpdateSchema,
  settingSchema,
  streamMaxBitrateKbpsSettingValueSchema,
  voiceMaxBitrateKbpsSettingSchema,
  voiceMaxBitrateKbpsSettingValueSchema,
} from '../index';

describe('Settings Schemas', () => {
  describe('voiceMaxBitrateKbpsSettingValueSchema', () => {
    it.each([8, 64, 96, 128, 384])('accepts valid bitrate value %d', (val) => {
      const result = voiceMaxBitrateKbpsSettingValueSchema.safeParse(val);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(val);
      }
    });

    it.each([7, 385, 0, -10, 64.5, '64', null, undefined, NaN])(
      'rejects invalid bitrate value %s',
      (val) => {
        const result = voiceMaxBitrateKbpsSettingValueSchema.safeParse(val);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            SCHEMA_ERROR.VOICE_MAX_BITRATE_RANGE,
          );
        }
      },
    );

    it('has default 64', () => {
      expect(DEFAULT_VOICE_MAX_BITRATE_KBPS).toBe(64);
    });
  });

  describe('voiceMaxBitrateKbpsSettingSchema', () => {
    it('accepts valid full setting entity', () => {
      const parsed = voiceMaxBitrateKbpsSettingSchema.safeParse({
        key: ESettingKey.VOICE_MAX_BITRATE_KBPS,
        value: 128,
        envLocked: true,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid key', () => {
      const parsed = voiceMaxBitrateKbpsSettingSchema.safeParse({
        key: ESettingKey.ATTACHMENTS_ENABLED,
        value: 128,
        envLocked: false,
        createdAt: new Date().toISOString(),
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('settingSchema & settingItemUpdateSchema discriminated unions', () => {
    it('parses voice max bitrate setting from settingSchema', () => {
      const parsed = settingSchema.safeParse({
        key: ESettingKey.VOICE_MAX_BITRATE_KBPS,
        value: 96,
        envLocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });
      expect(parsed.success).toBe(true);
    });

    it('parses voice max bitrate update from settingItemUpdateSchema', () => {
      const parsed = settingItemUpdateSchema.safeParse({
        key: ESettingKey.VOICE_MAX_BITRATE_KBPS,
        value: 96,
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('streamMaxBitrateKbpsSettingValueSchema', () => {
    it.each([1000, 10000, 15000, 100000])(
      'accepts valid stream bitrate value %d',
      (val) => {
        const result = streamMaxBitrateKbpsSettingValueSchema.safeParse(val);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(val);
        }
      },
    );

    it.each([999, 100001, 0, -10, 10000.5, '10000', null, undefined, NaN])(
      'rejects invalid stream bitrate value %s',
      (val) => {
        const result = streamMaxBitrateKbpsSettingValueSchema.safeParse(val);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            SCHEMA_ERROR.STREAM_MAX_BITRATE_RANGE,
          );
        }
      },
    );

    it('has default 20000', () => {
      expect(DEFAULT_STREAM_MAX_BITRATE_KBPS).toBe(20000);
    });

    it('parses stream max bitrate from the setting unions', () => {
      expect(
        settingSchema.safeParse({
          key: ESettingKey.STREAM_MAX_BITRATE_KBPS,
          value: 20000,
          envLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
        }).success,
      ).toBe(true);
      expect(
        settingItemUpdateSchema.safeParse({
          key: ESettingKey.STREAM_MAX_BITRATE_KBPS,
          value: 20000,
        }).success,
      ).toBe(true);
    });
  });

  describe('appUrlSettingValueSchema', () => {
    it.each([
      '',
      'https://konvoez.example.com',
      'http://localhost:3000',
      'https://chat.mycompany.org:8443',
    ])('accepts valid app URL %s', (val) => {
      const result = appUrlSettingValueSchema.safeParse(val);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(val);
      }
    });

    it.each(['ftp://example.com', 'not-a-url', 'javascript:alert(1)'])(
      'rejects invalid app URL %s',
      (val) => {
        const result = appUrlSettingValueSchema.safeParse(val);
        expect(result.success).toBe(false);
      },
    );

    it('has default empty string', () => {
      expect(DEFAULT_APP_URL).toBe('');
    });

    it('accepts valid full appUrl setting entity', () => {
      const parsed = appUrlSettingSchema.safeParse({
        key: ESettingKey.APP_URL,
        value: 'https://konvoez.example.com',
        envLocked: true,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });
      expect(parsed.success).toBe(true);
    });

    it('parses app URL from setting unions', () => {
      expect(
        settingSchema.safeParse({
          key: ESettingKey.APP_URL,
          value: 'https://konvoez.example.com',
          envLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
        }).success,
      ).toBe(true);
      expect(
        settingItemUpdateSchema.safeParse({
          key: ESettingKey.APP_URL,
          value: 'https://konvoez.example.com',
        }).success,
      ).toBe(true);
    });
  });

  describe('attachmentsKeepDaysSettingValueSchema', () => {
    it.each([0, 1, 7, 30, 365])('accepts valid keep days %d', (val) => {
      const result = attachmentsKeepDaysSettingValueSchema.safeParse(val);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(val);
      }
    });

    it.each([-1, -10, 1.5, '30', null, undefined, NaN])(
      'rejects invalid keep days %s',
      (val) => {
        const result = attachmentsKeepDaysSettingValueSchema.safeParse(val);
        expect(result.success).toBe(false);
      },
    );

    it('has default 0 (disabled)', () => {
      expect(DEFAULT_ATTACHMENTS_KEEP_DAYS).toBe(0);
    });

    it('accepts valid attachmentsKeepDays setting entity', () => {
      const parsed = attachmentsKeepDaysSettingSchema.safeParse({
        key: ESettingKey.ATTACHMENTS_KEEP_DAYS,
        value: 30,
        envLocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });
      expect(parsed.success).toBe(true);
    });

    it('parses attachments keep days from setting unions', () => {
      expect(
        settingSchema.safeParse({
          key: ESettingKey.ATTACHMENTS_KEEP_DAYS,
          value: 30,
          envLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
        }).success,
      ).toBe(true);
      expect(
        settingItemUpdateSchema.safeParse({
          key: ESettingKey.ATTACHMENTS_KEEP_DAYS,
          value: 30,
        }).success,
      ).toBe(true);
    });
  });
});
