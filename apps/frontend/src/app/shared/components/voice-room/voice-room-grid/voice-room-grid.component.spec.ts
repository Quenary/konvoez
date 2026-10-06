import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { EVoiceSessionType, IUser } from '@konvoez/shared';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { TuiNotificationService } from '@taiga-ui/core';
import { SettingsStore } from '@features/settings/settings.store';
import { DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN } from '@shared/schemas/local-settings.schema';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomGridComponent } from './voice-room-grid.component';
import { VoiceRoomViewService } from '../voice-room-view.service';

const user = (id: number): IUser =>
  ({ id, username: `u${id}`, fullname: `User ${id}` }) as IUser;

describe('VoiceRoomGridComponent', () => {
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
      imports: [VoiceRoomGridComponent],
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
            peersList: remotePeers.asReadonly(),
            activeSession: activeSession.asReadonly(),
            microphoneMuted: signal(false).asReadonly(),
            speakerMuted: signal(false).asReadonly(),
            peerGainLevels: signal({}).asReadonly(),
            peerScreenGainLevels: signal({}).asReadonly(),
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
          provide: VoiceSessionService,
          useValue: {
            watchPeerScreen: vi.fn().mockResolvedValue(undefined),
            stopWatchingPeerScreen,
          },
        },
        {
          provide: VoiceLeaveService,
          useValue: { leaveActiveVoice: vi.fn().mockResolvedValue(undefined) },
        },
        VoiceRoomViewService,
        {
          provide: TuiNotificationService,
          useValue: { open: vi.fn(() => of(null)) },
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
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const create = () => {
    const fixture = TestBed.createComponent(VoiceRoomGridComponent);
    fixture.componentRef.setInput('showControls', false);
    fixture.detectChanges();
    return fixture;
  };

  it('renders all peers in one grid with 16:9 tiles', () => {
    remoteCamTracks.set({ 3: { id: 'cam-3' } as MediaStreamTrack });
    const fixture = create();

    expect(fixture.nativeElement.querySelector('.peers-section')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.grid-item').length).toBe(3);
  });

  it('renders two tiles when local cam and screen are active', () => {
    localCamTrack.set({ id: 'cam' } as MediaStreamTrack);
    localScreenTrack.set({ id: 'scr' } as MediaStreamTrack);
    const fixture = create();
    expect(fixture.nativeElement.querySelectorAll('.grid-item').length).toBe(4);
  });

  it('renders two tiles for a remote peer with cam and live screen', () => {
    remoteCamTracks.set({ 2: { id: 'cam' } as MediaStreamTrack });
    availableScreens.set({ 2: { videoProducerId: 'p1' } });
    const fixture = create();
    expect(fixture.nativeElement.querySelectorAll('.grid-item').length).toBe(4);
  });

  it('does not render the grid while theatre is open', () => {
    remoteScreenTracks.set({ 2: { id: 'scr' } as MediaStreamTrack });
    availableScreens.set({ 2: { videoProducerId: 'p1' } });
    watchingUserIds.set(new Set([2]));

    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['onOpenTheatre'](2, 'screen');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.peers-layout')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-voice-room-theatre'),
    ).toBeTruthy();
  });

  it('keeps theatre on the same screen tile after stop watching', async () => {
    remoteScreenTracks.set({ 2: { id: 'scr' } as MediaStreamTrack });
    availableScreens.set({ 2: { videoProducerId: 'p1' } });
    watchingUserIds.set(new Set([2]));

    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['onOpenTheatre'](2, 'screen');
    fixture.detectChanges();

    await cmp['onStopWatchScreen'](2);
    watchingUserIds.set(new Set());
    remoteScreenTracks.set({});
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(cmp['theatreFocus']()).toEqual({ peerId: 2, stream: 'screen' });
    expect(fixture.nativeElement.querySelector('.peers-layout')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-voice-room-theatre'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.stage-tile')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.stage-video')).toBeNull();
  });

  it('retargets to the same peer camera when their screen tile disappears', () => {
    remoteCamTracks.set({ 2: { id: 'cam' } as MediaStreamTrack });
    availableScreens.set({ 2: { videoProducerId: 'p1' } });
    watchingUserIds.set(new Set([2]));

    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['onOpenTheatre'](2, 'screen');
    fixture.detectChanges();

    availableScreens.set({});
    watchingUserIds.set(new Set());
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(cmp['theatreFocus']()).toEqual({ peerId: 2, stream: 'cam' });
    expect(fixture.nativeElement.querySelector('.stage-video')).toBeTruthy();
  });

  it('retargets to the first tile when the focused peer leaves', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp['onOpenTheatre'](3, null);
    fixture.detectChanges();

    remotePeers.set([]);
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(cmp['theatreFocus']()).toEqual({ peerId: 1, stream: null });
    expect(
      fixture.nativeElement.querySelector('app-voice-room-theatre'),
    ).toBeTruthy();
  });
});
