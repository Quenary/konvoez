import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '@ngrx/store';
import { IUser } from '@konvoez/shared';
import { TVoiceRoomTile } from '../voice-room-tiles';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { SettingsStore } from '@features/settings/settings.store';
import { AudioService } from '@core/services/audio.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { VoiceRoomOverlayComponent } from './voice-room-overlay.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceRoomTilesService } from '../voice-room-tiles.service';

const stageTile = (
  peerId: number,
  streamKind: 'cam' | 'screen' | null,
  watchingScreen: boolean,
): TVoiceRoomTile => ({
  key: `${peerId}:${streamKind ?? 'voice'}`,
  peer: { id: peerId, username: `u${peerId}` } as IUser,
  peerId,
  streamKind,
  videoTrack: null,
  screenAvailable: streamKind === 'screen',
  watchingScreen,
});

describe('VoiceRoomOverlayComponent', () => {
  let layout: ReturnType<typeof signal<'grid' | 'theatre'>>;
  let chromeVisible: ReturnType<typeof signal<boolean>>;
  let isFullscreen: ReturnType<typeof signal<boolean>>;
  let theatreTile: ReturnType<typeof signal<TVoiceRoomTile | null>>;
  let tiles: ReturnType<typeof signal<TVoiceRoomTile[]>>;
  let leaveActiveVoice: ReturnType<typeof vi.fn>;
  let toggleLayout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    layout = signal('grid');
    chromeVisible = signal(true);
    isFullscreen = signal(false);
    theatreTile = signal(null);
    tiles = signal([stageTile(1, null, false)]);
    leaveActiveVoice = vi.fn().mockResolvedValue(undefined);
    toggleLayout = vi.fn();

    TestBed.configureTestingModule({
      imports: [VoiceRoomOverlayComponent],
      providers: [
        provideTranslateService(),
        {
          provide: Store,
          useValue: {
            selectSignal: () =>
              signal({ id: 1, username: 'me' } as IUser).asReadonly(),
          },
        },
        {
          provide: VoiceRoomViewService,
          useValue: {
            chromeVisible: chromeVisible.asReadonly(),
            layout: layout.asReadonly(),
            isFullscreen: isFullscreen.asReadonly(),
            revealChrome: vi.fn(),
            toggleFullscreen: vi.fn(),
          },
        },
        {
          provide: VoiceRoomTilesService,
          useValue: {
            tiles: tiles.asReadonly(),
            theatreTile: theatreTile.asReadonly(),
          },
        },
        {
          provide: VoiceRoomActionsService,
          useValue: { toggleLayout },
        },
        {
          provide: VoiceLeaveService,
          useValue: { leaveActiveVoice },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false).asReadonly(),
            speakerMuted: signal(false).asReadonly(),
            peerScreenGainLevels: signal({}).asReadonly(),
            setMicrophoneMuted: vi.fn(),
            setSpeakerMuted: vi.fn(),
            setPeerScreenGain: vi.fn(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            streamHeight: signal(720).asReadonly(),
            streamFps: signal(30).asReadonly(),
            screenHeight: signal(1080).asReadonly(),
            screenFps: signal(30).asReadonly(),
            setStreamHeight: vi.fn(),
            setStreamFps: vi.fn(),
            setScreenHeight: vi.fn(),
            setScreenFps: vi.fn(),
          },
        },
        {
          provide: AudioService,
          useValue: { playMuteAudio: vi.fn() },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: signal(null).asReadonly(),
            localScreenTrack: signal(null).asReadonly(),
          },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            produceCamera: vi.fn(),
            stopCamera: vi.fn(),
            produceScreen: vi.fn(),
            stopScreen: vi.fn(),
            stopWatchingPeerScreen: vi.fn().mockResolvedValue(undefined),
            canProduce: signal(true).asReadonly(),
          },
        },
        {
          provide: TuiDialogService,
          useValue: { open: vi.fn(() => of(null)) },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn(() => of(null)) },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits left before leave finishes so navigation survives theatre teardown', async () => {
    let resolveLeave!: () => void;
    leaveActiveVoice.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLeave = resolve;
      }),
    );

    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.detectChanges();

    let left = false;
    fixture.componentInstance.left.subscribe(() => {
      left = true;
    });

    const hangup = fixture.componentInstance['onHangup']();
    expect(left).toBe(true);
    expect(leaveActiveVoice).toHaveBeenCalledTimes(1);

    resolveLeave();
    await hangup;
  });

  it('shows layout toggle and fullscreen in both layouts', () => {
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.componentRef.setInput('participantsCount', 2);
    fixture.detectChanges();

    const accessories = fixture.nativeElement.querySelector(
      '[tuiAccessories]',
    ) as HTMLElement | null;
    expect(accessories).toBeTruthy();
    expect(accessories?.querySelectorAll('button').length).toBe(2);

    layout.set('theatre');
    fixture.detectChanges();

    expect(accessories?.querySelectorAll('button').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector(
        'app-voice-room-theatre-watch-controls',
      ),
    ).toBeNull();

    theatreTile.set(stageTile(2, 'screen', true));
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        'app-voice-room-theatre-watch-controls',
      ),
    ).toBeTruthy();
  });

  it('hides watch controls when the stage tile is not a watched remote screen', () => {
    layout.set('theatre');
    theatreTile.set(stageTile(2, 'screen', false));
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.detectChanges();

    const controls = () =>
      fixture.nativeElement.querySelector(
        'app-voice-room-theatre-watch-controls',
      );
    expect(controls()).toBeNull();

    theatreTile.set(stageTile(1, 'screen', true));
    fixture.detectChanges();
    expect(controls()).toBeNull();
  });

  it('toggles the layout from the header button and labels it by target mode', () => {
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.detectChanges();

    const toggle = () =>
      fixture.nativeElement.querySelector(
        '[tuiAccessories] button[aria-label]',
      ) as HTMLButtonElement;
    expect(toggle().getAttribute('aria-label')).toBe('CALL.SHOW_THEATRE');

    toggle().click();
    expect(toggleLayout).toHaveBeenCalledTimes(1);

    layout.set('theatre');
    fixture.detectChanges();
    expect(toggle().getAttribute('aria-label')).toBe('CALL.SHOW_GRID');
  });

  it('disables the layout toggle in grid when there is no tile for the stage', () => {
    tiles.set([]);
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      '[tuiAccessories] button[aria-label]',
    ) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);

    layout.set('theatre');
    fixture.detectChanges();
    expect(toggle.disabled).toBe(false);
  });

  it('applies vignette classes only in fullscreen', () => {
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.room-header.vignette'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.controls-dock.vignette'),
    ).toBeNull();

    isFullscreen.set(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.room-header.vignette'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('.controls-dock.vignette'),
    ).toBeTruthy();
  });
});
