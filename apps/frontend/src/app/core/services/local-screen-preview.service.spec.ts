import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SettingsStore } from '@core/stores/settings.store';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_SCREEN_PREVIEW_PAUSE_MS,
  LocalScreenPreviewService,
} from './local-screen-preview.service';
import { PeerVideoService } from './peer-video.service';

describe('LocalScreenPreviewService', () => {
  let autoPause: ReturnType<typeof signal<boolean>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let setAutoPause: ReturnType<typeof vi.fn>;
  let visibilityState: DocumentVisibilityState;
  let hasFocus: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = 'visible';
    hasFocus = true;
    autoPause = signal(DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN);
    localScreenTrack = signal<MediaStreamTrack | null>({
      id: 'scr',
    } as MediaStreamTrack);
    setAutoPause = vi.fn((value: boolean) => {
      autoPause.set(value);
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
    vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus);

    TestBed.configureTestingModule({
      providers: [
        LocalScreenPreviewService,
        {
          provide: SettingsStore,
          useValue: {
            screenPreviewAutoPauseWhenHidden: autoPause.asReadonly(),
            setScreenPreviewAutoPauseWhenHidden: setAutoPause,
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localScreenTrack: localScreenTrack.asReadonly(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const service = () => TestBed.inject(LocalScreenPreviewService);

  it('pauses 5s after the tab is hidden and does not resume when it is shown', () => {
    const preview = service();
    expect(preview.paused()).toBe(false);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(LOCAL_SCREEN_PREVIEW_PAUSE_MS - 1);
    expect(preview.paused()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(preview.paused()).toBe(true);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(LOCAL_SCREEN_PREVIEW_PAUSE_MS);
    expect(preview.paused()).toBe(true);
  });

  it('pauses 5s after the window blurs', () => {
    const preview = service();
    hasFocus = false;
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(LOCAL_SCREEN_PREVIEW_PAUSE_MS);
    expect(preview.paused()).toBe(true);
  });

  it('does not pause without a local screen or when the setting is off', () => {
    localScreenTrack.set(null);
    const preview = service();
    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(LOCAL_SCREEN_PREVIEW_PAUSE_MS);
    expect(preview.paused()).toBe(false);

    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    autoPause.set(false);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(LOCAL_SCREEN_PREVIEW_PAUSE_MS);
    expect(preview.paused()).toBe(false);
  });

  it('clears a pause when sharing stops and when the user resumes', () => {
    const preview = service();
    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(LOCAL_SCREEN_PREVIEW_PAUSE_MS);
    expect(preview.paused()).toBe(true);

    preview.resume();
    expect(preview.paused()).toBe(false);

    vi.advanceTimersByTime(LOCAL_SCREEN_PREVIEW_PAUSE_MS);
    expect(preview.paused()).toBe(true);

    localScreenTrack.set(null);
    TestBed.flushEffects();
    expect(preview.paused()).toBe(false);
  });
});
