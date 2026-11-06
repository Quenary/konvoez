import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { IUserSafe } from '@konvoez/shared';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { SettingsStore } from '@core/stores/settings.store';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomTheatreComponent } from './voice-room-theatre.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceRoomTilesService } from '../voice-room-tiles.service';
import { buildVoiceRoomTiles, type TVoiceRoomTile } from '../voice-room-tiles';

const peer = (id: number, username = `u${id}`): IUserSafe =>
  ({ id, username, fullname: `User ${id}` }) as IUserSafe;

const stripTiles = () =>
  buildVoiceRoomTiles({
    peers: [peer(1), peer(2), peer(3)],
    localUserId: 1,
    localCamTrack: null,
    localScreenTrack: null,
    remoteCamTracks: {},
    remoteScreenTracks: {
      2: { id: 'scr-2' } as MediaStreamTrack,
      3: { id: 'scr-3' } as MediaStreamTrack,
    },
    availableScreens: {
      2: { videoProducerId: 'p1' },
      3: { videoProducerId: 'p2' },
    },
    watchingUserIds: new Set([2, 3]),
  });

describe('VoiceRoomTheatreComponent', () => {
  let openTheatre: ReturnType<typeof vi.fn>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let tiles: ReturnType<typeof signal<TVoiceRoomTile[]>>;
  let theatreTile: ReturnType<typeof signal<TVoiceRoomTile | null>>;

  beforeEach(() => {
    openTheatre = vi.fn();
    localScreenTrack = signal<MediaStreamTrack | null>(null);
    const initialTiles = stripTiles();
    tiles = signal(initialTiles);
    theatreTile = signal(
      initialTiles.find(
        (tile) => tile.peerId === 2 && tile.streamKind === 'screen',
      ) ?? null,
    );
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
      imports: [VoiceRoomTheatreComponent],
      providers: [
        provideTranslateService(),
        {
          provide: Store,
          useValue: {
            selectSignal: () => signal(peer(1)).asReadonly(),
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
          provide: PeerVideoService,
          useValue: {
            localScreenTrack: localScreenTrack.asReadonly(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            screenPreviewAutoPauseWhenHidden: signal(
              DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN,
            ).asReadonly(),
            setScreenPreviewAutoPauseWhenHidden: vi.fn(),
          },
        },
        {
          provide: AudioActivityService,
          useValue: {
            speakingMap: signal({}).asReadonly(),
          },
        },
        {
          provide: VoiceRoomViewService,
          useValue: {
            chromeVisible: signal(true).asReadonly(),
            toggleFullscreen: vi.fn(),
            openTheatre,
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
          provide: VoiceRoomTilesService,
          useValue: {
            tiles: tiles.asReadonly(),
            theatreTile: computed(() => theatreTile()),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const create = () => {
    const fixture = TestBed.createComponent(VoiceRoomTheatreComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('opens another watching screen tile from the strip via the tiles service', () => {
    const fixture = create();
    const allTiles = stripTiles();
    const otherScreen = allTiles.find(
      (t) => t.peerId === 3 && t.streamKind === 'screen',
    );
    expect(otherScreen).toBeDefined();
    if (otherScreen == null) {
      return;
    }
    fixture.componentInstance['onStripTileClick'](otherScreen);
    expect(openTheatre).toHaveBeenCalledWith(3, 'screen');
  });

  it('shows a large tile without video and opens a voice strip tile', () => {
    const allTiles = stripTiles();
    const voice = allTiles.find(
      (tile) => tile.peerId === 1 && tile.streamKind == null,
    );
    expect(voice).toBeDefined();
    if (voice == null) {
      return;
    }

    theatreTile.set(voice);
    const fixture = create();
    expect(fixture.nativeElement.querySelector('.stage-video')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-voice-room-tile'),
    ).toBeTruthy();

    fixture.componentInstance['onStripTileClick'](voice);
    expect(openTheatre).not.toHaveBeenCalled();

    const screen = allTiles.find(
      (tile) => tile.peerId === 2 && tile.streamKind === 'screen',
    );
    expect(screen).toBeDefined();
    if (screen == null) {
      return;
    }
    theatreTile.set(screen);
    const watching = create();
    watching.componentInstance['onStripTileClick'](voice);
    expect(openTheatre).toHaveBeenCalledWith(1, null);
  });

  it('shows a paused placeholder for the local screen on the stage and the strip', () => {
    vi.useFakeTimers();
    const screenTrack = { id: 'local-scr' } as MediaStreamTrack;
    localScreenTrack.set(screenTrack);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    const local = peer(1);
    const buildTiles = (paused = false) =>
      buildVoiceRoomTiles({
        peers: [local, peer(2)],
        localUserId: 1,
        localCamTrack: null,
        localScreenTrack: screenTrack,
        remoteCamTracks: {},
        remoteScreenTracks: {},
        availableScreens: {},
        watchingUserIds: new Set(),
        localScreenPreviewPaused: paused,
      });
    const built = buildTiles(false);
    const localScreen = built.find(
      (tile) => tile.peerId === 1 && tile.streamKind === 'screen',
    );
    expect(localScreen).toBeDefined();

    tiles.set(built);
    theatreTile.set(localScreen ?? null);
    const fixture = create();

    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    const pausedTiles = buildTiles(true);
    tiles.set(pausedTiles);
    theatreTile.set(
      pausedTiles.find(
        (tile) => tile.peerId === 1 && tile.streamKind === 'screen',
      ) ?? null,
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.stage-video')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.preview-paused-overlay'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector(
        '.strip-tile-wrap.preview-paused video',
      ),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.strip-tile-wrap.preview-paused'),
    ).toBeTruthy();
  });

  const stageVideo = (root: HTMLElement): HTMLVideoElement => {
    const video = root.querySelector('.stage-video');
    expect(video).toBeInstanceOf(HTMLVideoElement);
    return video as HTMLVideoElement;
  };

  const setFrameSize = (
    video: HTMLVideoElement,
    width: number,
    height: number,
  ): void => {
    Object.defineProperty(video, 'videoWidth', {
      configurable: true,
      get: () => width,
    });
    Object.defineProperty(video, 'videoHeight', {
      configurable: true,
      get: () => height,
    });
  };

  const wideStage = (root: HTMLElement): void => {
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      width: 2560,
      height: 1080,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 2560,
      bottom: 1080,
      toJSON: () => ({}),
    } as DOMRect);
  };

  it('keeps the default strip until a resize reports the 32:9 frame', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    wideStage(root);
    fixture.componentInstance['updateStripPlacement']();
    fixture.detectChanges();
    expect(
      root.querySelector('.theatre')?.classList.contains('strip-right'),
    ).toBe(true);

    const video = stageVideo(root);
    setFrameSize(video, 0, 0);
    video.dispatchEvent(new Event('loadedmetadata'));
    fixture.detectChanges();
    expect(
      root.querySelector('.theatre')?.classList.contains('strip-right'),
    ).toBe(true);

    setFrameSize(video, 3840, 1080);
    video.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    const theatre = root.querySelector('.theatre');
    expect(theatre?.classList.contains('strip-bottom')).toBe(true);
    expect(theatre?.classList.contains('strip-right')).toBe(false);
  });

  it('places the strip from a 32:9 size already present on loadedmetadata', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    wideStage(root);
    const video = stageVideo(root);
    setFrameSize(video, 3840, 1080);
    video.dispatchEvent(new Event('loadedmetadata'));
    fixture.detectChanges();
    const theatre = root.querySelector('.theatre');
    expect(theatre?.classList.contains('strip-bottom')).toBe(true);
    expect(theatre?.classList.contains('strip-right')).toBe(false);
  });
});
