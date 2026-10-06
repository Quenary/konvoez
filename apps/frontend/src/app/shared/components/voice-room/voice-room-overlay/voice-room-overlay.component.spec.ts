import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '@ngrx/store';
import { IUser } from '@konvoez/shared';
import { TVoiceRoomTile } from '../voice-room-tiles';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { IRoom } from '@features/rooms/rooms.interface';
import { RoomManageService } from '@features/rooms/room-manage.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { SettingsStore } from '@features/settings/settings.store';
import { AudioService } from '@core/services/audio.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { TuiDialogService, TuiNotificationService } from '@taiga-ui/core';
import { VoiceRoomOverlayComponent } from './voice-room-overlay.component';
import { VoiceRoomViewService } from '../voice-room-view.service';

const room = {
  id: 4,
  name: 'VIP',
  avatarUrl: '',
} as IRoom;

describe('VoiceRoomOverlayComponent', () => {
  let theatreOpen: ReturnType<typeof signal<boolean>>;
  let chromeVisible: ReturnType<typeof signal<boolean>>;
  let isFullscreen: ReturnType<typeof signal<boolean>>;
  let theatreFocus: ReturnType<
    typeof signal<{ peerId: number; stream: 'cam' | 'screen' | null } | null>
  >;
  let watchingUserIds: ReturnType<typeof signal<ReadonlySet<number>>>;

  beforeEach(() => {
    theatreOpen = signal(false);
    chromeVisible = signal(true);
    isFullscreen = signal(false);
    theatreFocus = signal(null);
    watchingUserIds = signal(new Set<number>());

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
            theatreOpen: theatreOpen.asReadonly(),
            theatreFocus: theatreFocus.asReadonly(),
            theatreFocusId: signal<number | null>(null).asReadonly(),
            isFullscreen: isFullscreen.asReadonly(),
            closeTheatre: vi.fn(),
            revealChrome: vi.fn(),
            toggleFullscreen: vi.fn(),
          },
        },
        {
          provide: RoomManageService,
          useValue: {
            canManageRooms: signal(true).asReadonly(),
            editRoom: vi.fn(),
            deleteRoom: vi.fn(),
          },
        },
        {
          provide: VoiceLeaveService,
          useValue: { leaveActiveVoice: vi.fn().mockResolvedValue(undefined) },
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
            watchingUserIds: watchingUserIds.asReadonly(),
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

  it('keeps fullscreen in the header for grid and theatre', () => {
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.componentRef.setInput('room', room);
    fixture.componentRef.setInput('participantsCount', 2);
    fixture.detectChanges();

    const accessories = fixture.nativeElement.querySelector(
      '[tuiAccessories]',
    ) as HTMLElement | null;
    const actions = accessories?.querySelector(
      'app-voice-room-theatre-actions',
    ) as HTMLElement | null;
    expect(accessories).toBeTruthy();
    expect(actions).toBeTruthy();
    expect(actions?.querySelectorAll('button').length).toBe(1);
    expect(
      fixture.nativeElement.querySelector(
        'app-voice-room-theatre-watch-controls',
      ),
    ).toBeNull();

    theatreOpen.set(true);
    fixture.detectChanges();

    expect(actions?.querySelectorAll('button').length).toBe(2);
    expect(
      fixture.nativeElement.querySelector(
        'app-voice-room-theatre-watch-controls',
      ),
    ).toBeNull();

    watchingUserIds.set(new Set([2]));
    fixture.componentRef.setInput('theatreTile', {
      key: '2:screen',
      peer: { id: 2, username: 'u2' } as IUser,
      peerId: 2,
      streamKind: 'screen',
      videoTrack: null,
      screenAvailable: true,
      watchingScreen: true,
    } satisfies TVoiceRoomTile);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        'app-voice-room-theatre-watch-controls',
      ),
    ).toBeTruthy();
  });

  it('applies vignette classes only in fullscreen', () => {
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.componentRef.setInput('room', room);
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
