import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerVideoService } from '@core/services/peer-video.service';
import { SettingsStore } from '@features/settings/settings.store';
import { ScreenSharePipComponent } from './screen-share-pip.component';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';

describe('ScreenSharePipComponent', () => {
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let autoPauseWhenHidden: ReturnType<typeof signal<boolean>>;
  let setScreenPreviewAutoPauseWhenHidden: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localScreenTrack = signal<MediaStreamTrack | null>(null);
    autoPauseWhenHidden = signal(DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN);
    setScreenPreviewAutoPauseWhenHidden = vi.fn((value: boolean) => {
      autoPauseWhenHidden.set(value);
    });
    vi.stubGlobal(
      'MediaStream',
      class MediaStream {
        constructor(readonly tracks: readonly MediaStreamTrack[] = []) {}
        getVideoTracks() {
          return this.tracks;
        }
      },
    );
    TestBed.configureTestingModule({
      imports: [ScreenSharePipComponent],
      providers: [
        provideTranslateService(),
        {
          provide: PeerVideoService,
          useValue: {
            localScreenTrack: localScreenTrack.asReadonly(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            screenPreviewAutoPauseWhenHidden: autoPauseWhenHidden.asReadonly(),
            setScreenPreviewAutoPauseWhenHidden,
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is visible only when a local screen track exists', () => {
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance['visible']()).toBe(false);

    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    fixture.detectChanges();
    expect(fixture.componentInstance['visible']()).toBe(true);
  });

  it('pauses preview after debounce when the tab is hidden', () => {
    vi.useFakeTimers();
    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cmp['previewPaused']()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(cmp['previewPaused']()).toBe(true);
  });

  it('does not resume when the tab becomes visible again', () => {
    vi.useFakeTimers();
    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    let visibility: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    expect(cmp['previewPaused']()).toBe(true);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(cmp['previewPaused']()).toBe(true);
  });

  it('resumes only when the user clicks resume', () => {
    vi.useFakeTimers();
    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    expect(cmp['previewPaused']()).toBe(true);

    cmp['onResumePreview']();
    expect(cmp['previewPaused']()).toBe(false);
  });

  it('pauses after debounce when the window loses focus', () => {
    vi.useFakeTimers();
    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(cmp['previewPaused']()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(cmp['previewPaused']()).toBe(true);
  });

  it('schedules pause when share starts while the tab is already hidden', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    fixture.detectChanges();
    expect(cmp['previewPaused']()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(cmp['previewPaused']()).toBe(true);
  });

  it('does not auto-pause when disabled in local settings', () => {
    vi.useFakeTimers();
    autoPauseWhenHidden.set(false);
    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10_000);
    expect(cmp['previewPaused']()).toBe(false);
  });

  it('persists opt-out via settings store', () => {
    const fixture = TestBed.createComponent(ScreenSharePipComponent);
    fixture.detectChanges();

    fixture.componentInstance['onAutoPauseWhenHiddenChange'](false);
    expect(setScreenPreviewAutoPauseWhenHidden).toHaveBeenCalledWith(false);
  });
});
