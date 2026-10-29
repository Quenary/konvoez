import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IUserSafe } from '@konvoez/shared';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';
import { ConsumerRegistry } from '@core/services/consumer-registry';
import { RemoteVideoViewService } from '@core/services/remote-video-view.service';
import { SettingsStore } from '@core/stores/settings.store';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';
import { VoiceRoomTileComponent } from './voice-room-tile.component';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceRoomViewService } from '../voice-room-view.service';

const user = (id: number): IUserSafe =>
  ({ id, username: `u${id}`, fullname: `User ${id}` }) as IUserSafe;

describe('VoiceRoomTileComponent', () => {
  let currentUser: ReturnType<typeof signal<IUserSafe | null>>;
  let autoPauseWhenHidden: ReturnType<typeof signal<boolean>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let setScreenPreviewAutoPauseWhenHidden: ReturnType<typeof vi.fn>;
  let setQuality: ReturnType<typeof vi.fn>;
  let layersById: ReturnType<
    typeof signal<Record<string, Array<{ height: number; fps: number }>>>
  >;
  let quality: ReturnType<
    typeof signal<'auto' | { height: number; fps: number }>
  >;

  beforeEach(() => {
    currentUser = signal(user(1));
    autoPauseWhenHidden = signal(DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN);
    localScreenTrack = signal<MediaStreamTrack | null>(null);
    setScreenPreviewAutoPauseWhenHidden = vi.fn((value: boolean) => {
      autoPauseWhenHidden.set(value);
    });
    setQuality = vi.fn();
    layersById = signal({});
    quality = signal('auto');
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
            getScreenConsumerId: vi.fn(() => 'screen-2'),
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
            pause: vi.fn(),
            setAutoPauseWhenHidden: vi.fn(),
            autoPauseWhenHidden: autoPauseWhenHidden.asReadonly(),
          },
        },
        {
          provide: ConsumerRegistry,
          useValue: { layersById: layersById.asReadonly() },
        },
        {
          provide: RemoteVideoViewService,
          useValue: {
            quality: quality.asReadonly(),
            setQuality,
            registerView: vi.fn(() => () => undefined),
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
    expect(fixture.nativeElement.querySelector('.badge-calling')).toBeNull();
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

  it('shows a pause control on the local screen tile while preview is playing', () => {
    const fixture = create('screen', false);
    expect(
      fixture.nativeElement.querySelector(
        'app-voice-room-local-screen-preview-pause-button',
      ),
    ).not.toBeNull();

    fixture.componentRef.setInput('previewPaused', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        'app-voice-room-local-screen-preview-pause-button',
      ),
    ).toBeNull();
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

  it.each([
    {
      label: 'muted and deafened',
      state: { muted: true, deafened: true },
      expectMic: true,
      expectHeadphone: true,
    },
    {
      label: 'muted only',
      state: { muted: true, deafened: false },
      expectMic: true,
      expectHeadphone: false,
    },
    {
      label: 'deafened only',
      state: { muted: false, deafened: true },
      expectMic: false,
      expectHeadphone: true,
    },
    {
      label: 'active (unmuted and undeafened)',
      state: { muted: false, deafened: false },
      expectMic: false,
      expectHeadphone: false,
    },
  ])(
    'displays expected badges for remote peer when $label',
    ({ state, expectMic, expectHeadphone }) => {
      const fixture = TestBed.createComponent(VoiceRoomTileComponent);
      fixture.componentRef.setInput('peer', {
        ...user(2),
        ...state,
      });
      fixture.componentRef.setInput('streamKind', null);
      fixture.detectChanges();

      expect(fixture.componentInstance['isMuted']()).toBe(state.muted);
      expect(fixture.componentInstance['isDeafened']()).toBe(state.deafened);

      const badges = fixture.nativeElement.querySelectorAll('.badges tui-icon');
      const expectedCount = (expectMic ? 1 : 0) + (expectHeadphone ? 1 : 0);
      expect(badges.length).toBe(expectedCount);
    },
  );

  it('puts quality selection after screen volume and drops the theatre button', () => {
    const fixture = TestBed.createComponent(VoiceRoomTileComponent);
    fixture.componentRef.setInput('peer', user(2));
    fixture.componentRef.setInput('streamKind', 'screen');
    fixture.componentRef.setInput('screenAvailable', true);
    fixture.componentRef.setInput('watchingScreen', true);
    fixture.componentRef.setInput('videoTrack', {
      id: 'scr',
    } as MediaStreamTrack);
    fixture.detectChanges();

    const group = fixture.nativeElement.querySelector(
      '.info-actions [tuiGroup]',
    ) as HTMLElement;
    expect(group.querySelectorAll('button').length).toBe(2);

    layersById.set({
      'screen-2': [
        { height: 480, fps: 30 },
        { height: 1080, fps: 60 },
      ],
    });
    fixture.detectChanges();
    const buttons = group.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(
      fixture.componentInstance['qualityItems']().map((item) => item.label),
    ).toEqual(['1080p60', '480p30']);

    quality.set({ height: 720, fps: 30 });
    fixture.detectChanges();
    expect(
      fixture.componentInstance['qualityItems']().find((item) => item.checked)
        ?.label,
    ).toBe('480p30');

    fixture.componentInstance['onQualitySelect']({ height: 1080, fps: 60 });
    expect(setQuality).toHaveBeenCalledWith({ height: 1080, fps: 60 });
  });
});
