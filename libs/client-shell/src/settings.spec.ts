import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP_CONFIG, desktopConfigSchema } from './settings';

describe('desktopConfigSchema', () => {
  it('parses default config successfully', () => {
    const parsed = desktopConfigSchema.safeParse(DEFAULT_DESKTOP_CONFIG);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.shareAudio).toBe(true);
    }
  });

  it('defaults shareAudio to true when omitted', () => {
    const raw = {
      serverOrigin: null,
      hotkeys: {
        toggleMic: null,
        toggleSpeaker: null,
      },
      autostart: false,
    };
    const parsed = desktopConfigSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.shareAudio).toBe(true);
    }
  });
});
