import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerVideoService } from '@core/services/peer-video.service';
import { ScreenSharePipComponent } from './screen-share-pip.component';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';

describe('ScreenSharePipComponent', () => {
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;

  beforeEach(() => {
    localScreenTrack = signal<MediaStreamTrack | null>(null);
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

  it('pauses preview 5s after the tab becomes hidden and extends on demand', () => {
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

    vi.advanceTimersByTime(4999);
    expect(cmp['previewPaused']()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(cmp['previewPaused']()).toBe(true);

    cmp['onExtendPreview']();
    expect(cmp['previewPaused']()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(cmp['previewPaused']()).toBe(true);
  });
});
