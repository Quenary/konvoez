import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAllowedNavigation, isAllowedPermission } from './security';
import { getLocalPagePath } from './window';

describe('security policies', () => {
  describe('isAllowedNavigation', () => {
    const server = 'https://konvoez.example.com';

    it('allows file:// URLs only within local pages directory', () => {
      const serverPage = pathToFileURL(getLocalPagePath('server')).href;
      expect(isAllowedNavigation(serverPage, server)).toBe(true);
      expect(isAllowedNavigation(serverPage, null)).toBe(true);

      const outsideFile = pathToFileURL('/etc/passwd').href;
      expect(isAllowedNavigation(outsideFile, server)).toBe(false);
    });

    it('allows navigation within the configured server origin', () => {
      expect(
        isAllowedNavigation('https://konvoez.example.com/rooms', server),
      ).toBe(true);
      expect(
        isAllowedNavigation(
          'https://konvoez.example.com/settings/profile',
          server,
        ),
      ).toBe(true);
    });

    it('denies navigation to different origins or protocols', () => {
      expect(isAllowedNavigation('https://evil.com', server)).toBe(false);
      expect(
        isAllowedNavigation('https://sub.konvoez.example.com', server),
      ).toBe(false);
      expect(isAllowedNavigation('http://konvoez.example.com', server)).toBe(
        false,
      );
      expect(isAllowedNavigation('javascript:alert(1)', server)).toBe(false);
    });

    it('denies navigation when server origin is not set', () => {
      expect(
        isAllowedNavigation('https://konvoez.example.com/rooms', null),
      ).toBe(false);
    });
  });

  describe('isAllowedPermission', () => {
    const server = 'https://konvoez.example.com';

    it('allows whitelisted permissions for matching server origin', () => {
      expect(
        isAllowedPermission(
          'media',
          'https://konvoez.example.com/voice',
          server,
        ),
      ).toBe(true);
      expect(
        isAllowedPermission(
          'notifications',
          'https://konvoez.example.com',
          server,
        ),
      ).toBe(true);
      expect(
        isAllowedPermission(
          'display-capture',
          'https://konvoez.example.com',
          server,
        ),
      ).toBe(true);
    });

    it('denies permissions for untrusted origins', () => {
      expect(
        isAllowedPermission('media', 'https://attacker.example.com', server),
      ).toBe(false);
    });

    it('denies unlisted permissions even for server origin', () => {
      expect(
        isAllowedPermission(
          'geolocation',
          'https://konvoez.example.com',
          server,
        ),
      ).toBe(false);
      expect(
        isAllowedPermission('midi', 'https://konvoez.example.com', server),
      ).toBe(false);
    });

    it('denies permissions when server origin is null', () => {
      expect(
        isAllowedPermission('media', 'https://konvoez.example.com', null),
      ).toBe(false);
    });
  });
});
