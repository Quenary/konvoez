import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IUser } from '@konvoez/shared';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';
import { SettingsStore } from '@features/settings/settings.store';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';
import { VoiceRoomTileComponent } from './voice-room-tile.component';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceRoomViewService } from '../voice-room-view.service';

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
          provide: VoiceAudioPreferencesStore,
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
        {
          provide: VoiceRoomActionsService,
          useValue: {
            watchPeerScreen: vi.fn(),
            stopWatchingPeerScreen: vi.fn(),
          },
        },
        {
          provide: VoiceRoomViewService,
          useValue: { openTheatre: vi.fn() },
        },
        {
          provide: LocalScreenPreviewService,
          useValue: {
            resume: vi.fn(),
            setAutoPauseWhenHidden: vi.fn(),
            autoPauseWhenHidden: autoPauseWhenHidden.asReadonly(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const create = (
    streamKind: 'cam' | 'screen' | null = 'screen',
    previewPaused = false,
  ) => {
    if (streamKind === 'screen') {
      localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    }
    const fixture = TestBed.createComponent(VoiceRoomTileComponent);
    fixture.componentRef.setInput('peer', user(1));
    fixture.componentRef.setInput('streamKind', streamKind);
    fixture.componentRef.setInput('videoTrack', {
      id: 'scr',
    } as MediaStreamTrack);
    fixture.componentRef.setInput('previewPaused', previewPaused);
    fixture.detectChanges();
    return fixture;
  };

  it('renders video when preview is not paused', () => {
    const fixture = create('screen', false);
    const cmp = fixture.componentInstance;
    expect(cmp.previewPaused()).toBe(false);
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.preview-paused-overlay'),
    ).toBeNull();
  });

  it('shows auto-pause checkbox under resume only when preview is paused', () => {
    const unpausedFixture = create('screen', false);
    expect(
      unpausedFixture.nativeElement.querySelector('.auto-pause-row'),
    ).toBeNull();

    const pausedFixture = create('screen', true);
    const overlay = pausedFixture.nativeElement.querySelector(
      '.preview-paused-overlay',
    ) as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector('button + .auto-pause-row')).not.toBeNull();
  });

  it('resumes preview when the user clicks resume', () => {
    const fixture = create('screen', true);
    const previewService = TestBed.inject(LocalScreenPreviewService);
    const resumeSpy = vi.spyOn(previewService, 'resume');

    fixture.componentInstance['onResumePreview']();
    expect(resumeSpy).toHaveBeenCalled();
  });

  it('persists opt-out via local screen preview service', () => {
    const fixture = create('screen');
    const previewService = TestBed.inject(LocalScreenPreviewService);
    fixture.componentInstance['onAutoPauseWhenHiddenChange'](false);
    expect(previewService.setAutoPauseWhenHidden).toHaveBeenCalledWith(false);
  });
});
