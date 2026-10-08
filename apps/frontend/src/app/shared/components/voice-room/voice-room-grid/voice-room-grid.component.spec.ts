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
import { TuiNotificationService } from '@taiga-ui/core';
import { SettingsStore } from '@core/stores/settings.store';
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
  let availableScreens: ReturnType<
    typeof signal<Readonly<Record<number, { videoProducerId: string }>>>
  >;
  let localCamTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let localScreenTrack: ReturnType<typeof signal<MediaStreamTrack | null>>;
  let activeSession: ReturnType<
    typeof signal<{ type: EVoiceSessionType.GROUP_ROOM; roomId: number } | null>
  >;

  beforeEach(() => {
    currentUser = signal(user(1));
    remotePeers = signal([user(2), user(3)]);
    remoteCamTracks = signal<Record<number, MediaStreamTrack>>({});
    availableScreens = signal<Record<number, { videoProducerId: string }>>({});
    localCamTrack = signal<MediaStreamTrack | null>(null);
    localScreenTrack = signal<MediaStreamTrack | null>(null);
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
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: localCamTrack.asReadonly(),
            localScreenTrack: localScreenTrack.asReadonly(),
            remoteCamTracks: remoteCamTracks.asReadonly(),
            remoteScreenTracks: signal({}).asReadonly(),
            availableScreens: availableScreens.asReadonly(),
            watchingUserIds: signal(new Set<number>()).asReadonly(),
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            interlocutor: signal(null).asReadonly(),
            isRinging: signal(false).asReadonly(),
            isCalling: signal(false).asReadonly(),
            isIncoming: signal(false).asReadonly(),
          },
        },
        {
          provide: VoiceLeaveService,
          useValue: { leaveActiveVoice: vi.fn() },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            watchPeerScreen: vi.fn().mockResolvedValue(undefined),
            stopWatchingPeerScreen: vi.fn().mockResolvedValue(undefined),
            produceCamera: vi.fn(),
            stopCamera: vi.fn(),
            produceScreen: vi.fn(),
            stopScreen: vi.fn(),
            canProduce: signal(true).asReadonly(),
          },
        },
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
    fixture.detectChanges();
    return fixture;
  };

  it('renders all peers in one grid with 16:9 tiles', () => {
    remoteCamTracks.set({ 3: { id: 'cam-3' } as MediaStreamTrack });
    const fixture = create();

    expect(fixture.nativeElement.querySelector('.peers-section')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.grid-item').length).toBe(3);
    expect(
      fixture.nativeElement.querySelector('app-voice-room-theatre'),
    ).toBeNull();
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
});
