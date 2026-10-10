import { describe, expect, it } from 'vitest';
import { desktopHotkeysSchema, desktopVoiceStateSchema } from '@konvoez/shared';
import { isTrustedAppSender, isTrustedLocalSender } from './ipc';

describe('IPC security validation', () => {
  const serverOrigin = 'https://konvoez.example.com';

  describe('isTrustedAppSender', () => {
    it('returns true when frameUrl origin matches serverOrigin', () => {
      expect(
        isTrustedAppSender('https://konvoez.example.com/rooms/1', serverOrigin),
      ).toBe(true);
      expect(
        isTrustedAppSender('https://konvoez.example.com', serverOrigin),
      ).toBe(true);
    });

    it('returns false when frameUrl origin differs', () => {
      expect(
        isTrustedAppSender('https://evil.com/phishing', serverOrigin),
      ).toBe(false);
      expect(
        isTrustedAppSender('https://other.konvoez.example.com', serverOrigin),
      ).toBe(false);
      expect(isTrustedAppSender('file:///test/page.html', serverOrigin)).toBe(
        false,
      );
    });

    it('returns false when arguments are missing or invalid', () => {
      expect(isTrustedAppSender(undefined, serverOrigin)).toBe(false);
      expect(isTrustedAppSender('https://konvoez.example.com', null)).toBe(
        false,
      );
      expect(isTrustedAppSender('not-a-url', serverOrigin)).toBe(false);
    });
  });

  describe('isTrustedLocalSender', () => {
    it('returns true for file: URLs', () => {
      expect(isTrustedLocalSender('file:///dist/pages/server.html')).toBe(true);
      expect(isTrustedLocalSender('file:///dist/pages/settings.html')).toBe(
        true,
      );
    });

    it('returns false for web URLs or undefined', () => {
      expect(isTrustedLocalSender('https://konvoez.example.com')).toBe(false);
      expect(isTrustedLocalSender('http://localhost:3000')).toBe(false);
      expect(isTrustedLocalSender(undefined)).toBe(false);
      expect(isTrustedLocalSender('invalid-url')).toBe(false);
    });
  });

  describe('shared schemas validation', () => {
    it('desktopVoiceStateSchema validates correct structure', () => {
      const valid = {
        inVoice: true,
        micMuted: false,
        speakerMuted: false,
      };
      expect(desktopVoiceStateSchema.safeParse(valid).success).toBe(true);

      const invalid = {
        inVoice: 'yes',
        micMuted: false,
      };
      expect(desktopVoiceStateSchema.safeParse(invalid).success).toBe(false);
    });

    it('desktopHotkeysSchema accepts null and accelerator strings', () => {
      const valid = {
        toggleMic: 'CommandOrControl+Shift+M',
        toggleSpeaker: null,
      };
      expect(desktopHotkeysSchema.safeParse(valid).success).toBe(true);

      const invalid = {
        toggleMic: 12345,
        toggleSpeaker: null,
      };
      expect(desktopHotkeysSchema.safeParse(invalid).success).toBe(false);
    });
  });
});
