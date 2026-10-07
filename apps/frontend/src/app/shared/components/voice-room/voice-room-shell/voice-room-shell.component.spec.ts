import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { EVoiceSessionType, IUser } from '@konvoez/shared';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { SettingsStore } from '@features/settings/settings.store';
import { RoomManageService } from '@features/rooms/room-manage.service';
import { AudioService } from '@core/services/audio.service';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomShellComponent } from './voice-room-shell.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
const user = (id: number): IUser =>
  ({ id, username: `u${id}`, fullname: `User ${id}` }) as IUser;

describe('VoiceRoomShellComponent', () => {
  let currentUser: ReturnType<typeof signal<IUser | null>>;
  let remotePeers: ReturnType<typeof signal<readonly IUser[]>>;
  let remoteCamTracks: ReturnType<
    typeof signal<Readonly<Record<number, MediaStreamTrack>>>
  >;
  let remoteScreenTracks: ReturnType<
    typeof signal<Readonly<Record<number, MediaStreamTrack>>>
  >;
  let availableScreens: ReturnType<
    typeof signal<Readonly<Record<number, { videoProducerId: string }>>>
  >;
  let watchingUserIds: ReturnType<typeof signal<ReadonlySet<number>>>;
  let localCamTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let stopWatchingPeerScreen: ReturnType<typeof vi.fn>;
  let activeSession: ReturnType<
    typeof signal<{ type: EVoiceSessionType.GROUP_ROOM; roomId: number } | null>
  >;

  beforeEach(() => {
    currentUser = signal(user(1));
    remotePeers = signal([user(2), user(3)]);
    remoteCamTracks = signal<Record<number, MediaStreamTrack>>({});
    remoteScreenTracks = signal<Record<number, MediaStreamTrack>>({});
    availableScreens = signal<Record<number, { videoProducerId: string }>>({});
    watchingUserIds = signal(new Set<number>());
    localCamTrack = signal<MediaStreamTrack | null>(null);
    localScreenTrack = signal<MediaStreamTrack | null>(null);
    stopWatchingPeerScreen = vi.fn().mockResolvedValue(undefined);
    activeSession = signal({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
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
    vi.spyOn(HTMLVideoElement.prototype, 'pause').mockImplementation(() => {
      /* noop */
    });

    TestBed.configureTestingModule({
      imports: [VoiceRoomShellComponent],
      providers: [
        provideTranslateService(),
        VoiceRoomViewService,
        {
          provide: Store,
          useValue: {
            selectSignal: () => currentUser.asReadonly(),
          },
        },
        {
          provide: VoiceSessionStore,
          useValue: {
            peersList: remotePeers.asReadonly(),
            activeSession: activeSession.asReadonly(),
          },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false).asReadonly(),
            speakerMuted: signal(false).asReadonly(),
            peerGainLevels: signal({}).asReadonly(),
            peerScreenGainLevels: signal({}).asReadonly(),
            setMicrophoneMuted: vi.fn(),
            setSpeakerMuted: vi.fn(),
            setPeerGain: vi.fn(),
            setPeerScreenGain: vi.fn(),
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: localCamTrack.asReadonly(),
            localScreenTrack: localScreenTrack.asReadonly(),
            remoteCamTracks: remoteCamTracks.asReadonly(),
            remoteScreenTracks: remoteScreenTracks.asReadonly(),
            availableScreens: availableScreens.asReadonly(),
            watchingUserIds: watchingUserIds.asReadonly(),
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            interlocutor: signal(null).asReadonly(),
            isCalling: signal(false).asReadonly(),
            isIncoming: signal(false).asReadonly(),
          },
        },
        {
          provide: VoiceLeaveService,
          useValue: { leaveActiveVoice: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            watchPeerScreen: vi.fn().mockResolvedValue(undefined),
            stopWatchingPeerScreen,
            produceCamera: vi.fn(),
            stopCamera: vi.fn(),
            produceScreen: vi.fn(),
            stopScreen: vi.fn(),
          },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn(() => of(null)) },
        },
        {
          provide: TuiDialogService,
          useValue: { open: vi.fn(() => of(null)) },
        },
        {
          provide: RoomManageService,
          useValue: {
            canManageRooms: signal(false).asReadonly(),
            editRoom: vi.fn(),
            deleteRoom: vi.fn(),
          },
        },
        {
          provide: AudioService,
          useValue: { playMuteAudio: vi.fn() },
        },
        {
          provide: SettingsStore,
          useValue: {
            streamHeight: signal(720).asReadonly(),
            streamFps: signal(30).asReadonly(),
            screenHeight: signal(1080).asReadonly(),
            screenFps: signal(30).asReadonly(),
            screenPreviewAutoPauseWhenHidden: signal(
              DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN,
            ).asReadonly(),
            setStreamHeight: vi.fn(),
            setStreamFps: vi.fn(),
            setScreenHeight: vi.fn(),
            setScreenFps: vi.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const create = () => {
    const fixture = TestBed.createComponent(VoiceRoomShellComponent);
    fixture.detectChanges();
    return fixture;
  };

  const view = () => TestBed.inject(VoiceRoomViewService);

  it('shows theatre instead of the grid when theatre layout is active', () => {
    remoteScreenTracks.set({ 2: { id: 'scr' } as MediaStreamTrack });
    availableScreens.set({ 2: { videoProducerId: 'p1' } });
    watchingUserIds.set(new Set([2]));

    const fixture = create();
    view().openTheatre(2, 'screen');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.peers-layout')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-voice-room-theatre'),
    ).toBeTruthy();
  });

  it('reveals chrome on pointer activity over the active layout', () => {
    const fixture = create();
    view().openTheatre(2, null);
    fixture.detectChanges();
    const revealChrome = vi.spyOn(view(), 'revealChrome');

    fixture.nativeElement
      .querySelector('.stage')
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.nativeElement
      .querySelector('.stage')
      .dispatchEvent(new Event('pointermove', { bubbles: true }));

    expect(revealChrome).toHaveBeenCalledTimes(2);
  });

  it('switches layouts from the header button and returns to the same stage tile', () => {
    const fixture = create();
    const toggle = () =>
      fixture.nativeElement.querySelector(
        '[tuiAccessories] button[aria-label]',
      ) as HTMLButtonElement;
    const has = (selector: string) =>
      fixture.nativeElement.querySelector(selector) !== null;

    expect(has('app-voice-room-grid')).toBe(true);
    expect(has('app-voice-room-theatre')).toBe(false);

    view().openTheatre(3, null);
    fixture.detectChanges();
    expect(has('app-voice-room-grid')).toBe(false);
    expect(has('app-voice-room-theatre')).toBe(true);

    toggle().click();
    fixture.detectChanges();
    expect(has('app-voice-room-grid')).toBe(true);
    expect(has('app-voice-room-theatre')).toBe(false);

    toggle().click();
    fixture.detectChanges();
    expect(has('app-voice-room-theatre')).toBe(true);
    expect(view().theatreFocus()).toEqual({ peerId: 3, stream: null });
  });

  it('opens theatre from the grid button on a default tile when none was chosen', () => {
    const fixture = create();
    const toggle = fixture.nativeElement.querySelector(
      '[tuiAccessories] button[aria-label]',
    ) as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();

    expect(view().layout()).toBe('theatre');
    expect(view().theatreFocus()).toEqual({ peerId: 2, stream: null });
  });

  it('keeps theatre on the same screen tile after stop watching', async () => {
    remoteScreenTracks.set({ 2: { id: 'scr' } as MediaStreamTrack });
    availableScreens.set({ 2: { videoProducerId: 'p1' } });
    watchingUserIds.set(new Set([2]));

    const fixture = create();
    view().openTheatre(2, 'screen');
    fixture.detectChanges();

    await TestBed.inject(VoiceSessionService).stopWatchingPeerScreen(2);
    watchingUserIds.set(new Set());
    remoteScreenTracks.set({});
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(view().theatreFocus()).toEqual({ peerId: 2, stream: 'screen' });
    expect(fixture.nativeElement.querySelector('.peers-layout')).toBeNull();
    expect(fixture.nativeElement.querySelector('.stage-tile')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.stage-video')).toBeNull();
  });

  it('shows the first remote video when the focused screen tile disappears', () => {
    remoteCamTracks.set({ 2: { id: 'cam' } as MediaStreamTrack });
    availableScreens.set({ 2: { videoProducerId: 'p1' } });
    watchingUserIds.set(new Set([2]));

    const fixture = create();
    view().openTheatre(2, 'screen');
    fixture.detectChanges();

    availableScreens.set({});
    watchingUserIds.set(new Set());
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(view().theatreFocus()).toEqual({ peerId: 2, stream: 'screen' });
    expect(fixture.nativeElement.querySelector('.stage-video')).toBeTruthy();
  });

  it('shows a remaining tile when the focused peer leaves without rewriting focus', () => {
    const fixture = create();
    view().openTheatre(3, null);
    fixture.detectChanges();

    remotePeers.set([]);
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(view().theatreFocus()).toEqual({ peerId: 3, stream: null });
    expect(
      fixture.nativeElement.querySelector('app-voice-room-theatre'),
    ).toBeTruthy();
  });

  it('returns to grid on Escape when nothing else handled it', async () => {
    const fixture = create();
    view().openTheatre(2, null);
    fixture.detectChanges();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await Promise.resolve();
    fixture.detectChanges();

    expect(view().layout()).toBe('grid');
    expect(view().theatreFocus()).toEqual({ peerId: 2, stream: null });
  });

  it('keeps theatre open when Escape was already handled', async () => {
    const fixture = create();
    view().openTheatre(2, null);
    fixture.detectChanges();

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);
    await Promise.resolve();
    fixture.detectChanges();

    expect(view().layout()).toBe('theatre');
    expect(view().theatreFocus()).toEqual({
      peerId: 2,
      stream: null,
    });
  });

  it('keeps theatre open when a dialog is open', async () => {
    const fixture = create();
    view().openTheatre(2, null);
    fixture.detectChanges();

    const dialog = document.createElement('tui-dialog');
    document.body.append(dialog);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await Promise.resolve();
    dialog.remove();
    fixture.detectChanges();

    expect(view().layout()).toBe('theatre');
    expect(view().theatreFocus()).toEqual({
      peerId: 2,
      stream: null,
    });
  });
});
