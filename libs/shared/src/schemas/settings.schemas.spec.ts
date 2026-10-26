import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE_MAX_BITRATE_KBPS,
  ESettingKey,
  SCHEMA_ERROR,
  settingItemUpdateSchema,
  settingSchema,
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
});
