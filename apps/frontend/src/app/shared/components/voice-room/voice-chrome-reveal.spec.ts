import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_CHROME_HIDE_MS, VoiceChromeReveal } from './voice-chrome-reveal';

describe('VoiceChromeReveal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts hidden and does not schedule hide until revealed', () => {
    vi.useFakeTimers();
    const chrome = new VoiceChromeReveal();
    expect(chrome.visible()).toBe(false);

    vi.advanceTimersByTime(VOICE_CHROME_HIDE_MS);
    expect(chrome.visible()).toBe(false);
    chrome.destroy();
  });

  it('starts visible and hides after the timeout', () => {
    vi.useFakeTimers();
    const chrome = new VoiceChromeReveal(true);
    expect(chrome.visible()).toBe(true);

    vi.advanceTimersByTime(VOICE_CHROME_HIDE_MS);
    expect(chrome.visible()).toBe(false);
    chrome.destroy();
  });

  it('restarts the hide timer on each reveal', () => {
    vi.useFakeTimers();
    const chrome = new VoiceChromeReveal();
    chrome.reveal();
    vi.advanceTimersByTime(VOICE_CHROME_HIDE_MS - 100);
    chrome.reveal();
    vi.advanceTimersByTime(VOICE_CHROME_HIDE_MS - 100);
    expect(chrome.visible()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(chrome.visible()).toBe(false);
    chrome.destroy();
  });

  it('does not hide after destroy', () => {
    vi.useFakeTimers();
    const chrome = new VoiceChromeReveal(true);
    chrome.destroy();
    vi.advanceTimersByTime(VOICE_CHROME_HIDE_MS);
    expect(chrome.visible()).toBe(true);
  });
});
