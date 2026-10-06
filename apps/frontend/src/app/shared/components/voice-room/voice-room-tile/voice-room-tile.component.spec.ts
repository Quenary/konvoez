import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IUser } from '@konvoez/shared';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { SettingsStore } from '@features/settings/settings.store';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';
import { VoiceRoomTileComponent } from './voice-room-tile.component';

const user = (id: number): IUser => ({ id, username: `u${id}` }) as IUser;

describe('VoiceRoomTileComponent', () => {
  let currentUser: ReturnType<typeof signal<IUser | null>>;
  let autoPauseWhenHidden: ReturnType<typeof signal<boolean>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let setScreenPreviewAutoPauseWhenHidden: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    currentUser = signal(user(1));
    autoPauseWhenHidden = signal(DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN);
    localScreenTrack = signal<MediaStreamTrack | null>(null);
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
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [VoiceRoomTileComponent],
      providers: [
        provideTranslateService(),
        {
          provide: Store,
          useValue: {
            selectSignal: () => currentUser.asReadonly(),
          },
        },
        {
          provide: VoiceRoomStore,
          useValue: {
            microphoneMuted: signal(false).asReadonly(),
            speakerMuted: signal(false).asReadonly(),
            peerGainLevels: signal({}).asReadonly(),
            peerScreenGainLevels: signal({}).asReadonly(),
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            isCalling: signal(false).asReadonly(),
          },
        },
        {
          provide: AudioActivityService,
          useValue: {
            speakingMap: signal({}).asReadonly(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            screenPreviewAutoPauseWhenHidden: autoPauseWhenHidden.asReadonly(),
            setScreenPreviewAutoPauseWhenHidden,
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
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const create = (streamKind: 'cam' | 'screen' | null = 'screen') => {
    if (streamKind === 'screen') {
      localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    }
    const fixture = TestBed.createComponent(VoiceRoomTileComponent);
    fixture.componentRef.setInput('peer', user(1));
    fixture.componentRef.setInput('streamKind', streamKind);
    fixture.componentRef.setInput('videoTrack', {
      id: 'scr',
    } as MediaStreamTrack);
    fixture.detectChanges();
    return fixture;
  };

  it('pauses local screen preview after debounce when the tab is hidden', () => {
    vi.useFakeTimers();
    const fixture = create('screen');
    const cmp = fixture.componentInstance;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cmp['previewPaused']()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(cmp['previewPaused']()).toBe(true);
  });

  it('does not auto-pause local camera tile', () => {
    vi.useFakeTimers();
    const fixture = create('cam');
    const cmp = fixture.componentInstance;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10_000);
    expect(cmp['previewPaused']()).toBe(false);
  });

  it('resumes only when the user clicks resume', () => {
    vi.useFakeTimers();
    const fixture = create('screen');
    const cmp = fixture.componentInstance;

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

  it('does not auto-pause when disabled in local settings', () => {
    vi.useFakeTimers();
    autoPauseWhenHidden.set(false);
    const fixture = create('screen');
    const cmp = fixture.componentInstance;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10_000);
    expect(cmp['previewPaused']()).toBe(false);
  });

  it('persists opt-out via settings store', () => {
    const fixture = create('screen');
    fixture.componentInstance['onAutoPauseWhenHiddenChange'](false);
    expect(setScreenPreviewAutoPauseWhenHidden).toHaveBeenCalledWith(false);
  });

  it('labels the tile as opening theatre', () => {
    const fixture = create('cam');
    const video = fixture.nativeElement.querySelector(
      'video',
    ) as HTMLVideoElement;
    expect(video.getAttribute('aria-label')).toBe('CALL.OPEN_THEATRE_TILE');

    fixture.componentRef.setInput('peer', {
      id: 1,
      username: 'u1',
      fullname: 'User 1',
    } as IUser);
    fixture.componentRef.setInput('videoTrack', null);
    fixture.componentRef.setInput('streamKind', null);
    fixture.detectChanges();
    const idle = fixture.nativeElement.querySelector(
      '.idle-media',
    ) as HTMLElement;
    expect(idle.getAttribute('aria-label')).toBe('CALL.OPEN_THEATRE_TILE');
  });

  it('keeps the pause when the tile is created again', () => {
    vi.useFakeTimers();
    const fixture = create('screen');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    expect(fixture.componentInstance['previewPaused']()).toBe(true);

    fixture.destroy();
    const again = create('screen');
    expect(again.componentInstance['previewPaused']()).toBe(true);
  });
});
