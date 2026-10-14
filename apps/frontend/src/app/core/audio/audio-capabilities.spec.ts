import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMobileOrIos, isSimdSupported } from './audio-capabilities';

describe('audio-capabilities', () => {
  describe('isSimdSupported', () => {
    it('returns true when WebAssembly.validate accepts the SIMD probe', () => {
      vi.spyOn(WebAssembly, 'validate').mockReturnValue(true);
      expect(isSimdSupported()).toBe(true);
    });

    it('returns false when WebAssembly.validate rejects the SIMD probe', () => {
      vi.spyOn(WebAssembly, 'validate').mockReturnValue(false);
      expect(isSimdSupported()).toBe(false);
    });

    it('returns false when WebAssembly.validate throws an error', () => {
      vi.spyOn(WebAssembly, 'validate').mockImplementation(() => {
        throw new Error('validate failure');
      });
      expect(isSimdSupported()).toBe(false);
    });
  });

  describe('isMobileOrIos', () => {
    const originalNavigator = globalThis.navigator;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    });

    it('returns true when userAgentData.mobile is true', () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          userAgentData: { mobile: true },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          platform: 'Win32',
          maxTouchPoints: 0,
        },
      });

      expect(isMobileOrIos()).toBe(true);
    });

    it('returns true for mobile User-Agent strings (iPhone, iPad, iPod, Android)', () => {
      const mobileUas = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)',
        'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)',
        'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X)',
        'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
      ];

      for (const ua of mobileUas) {
        Object.defineProperty(globalThis, 'navigator', {
          configurable: true,
          value: {
            userAgent: ua,
            platform: 'Linux armv8l',
            maxTouchPoints: 5,
          },
        });
        expect(isMobileOrIos()).toBe(true);
      }
    });

    it('detects iPadOS with desktop Safari UA (platform MacIntel and maxTouchPoints > 1)', () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        },
      });

      expect(isMobileOrIos()).toBe(true);
    });

    it('returns false for desktop macOS (platform MacIntel and maxTouchPoints 0)', () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 0,
        },
      });

      expect(isMobileOrIos()).toBe(false);
    });

    it('returns false for desktop browsers without mobile indicators', () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          userAgentData: { mobile: false },
          userAgent:
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          platform: 'Linux x86_64',
          maxTouchPoints: 0,
        },
      });

      expect(isMobileOrIos()).toBe(false);
    });
  });
});
