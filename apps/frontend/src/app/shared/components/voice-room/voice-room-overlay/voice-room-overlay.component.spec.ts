import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { IRoom } from '@features/rooms/rooms.interface';
import { RoomManageService } from '@features/rooms/room-manage.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { SettingsStore } from '@features/settings/settings.store';
import { AudioService } from '@core/services/audio.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
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

  beforeEach(() => {
    theatreOpen = signal(false);
    chromeVisible = signal(true);

    TestBed.configureTestingModule({
      imports: [VoiceRoomOverlayComponent],
      providers: [
        provideTranslateService(),
        {
          provide: VoiceRoomViewService,
          useValue: {
            chromeVisible: chromeVisible.asReadonly(),
            theatreOpen: theatreOpen.asReadonly(),
            theatreFocusId: signal<number | null>(null).asReadonly(),
            isFullscreen: signal(false).asReadonly(),
            closeTheatre: vi.fn(),
            revealChrome: vi.fn(),
            toggleFullscreen: vi.fn(),
            stopWatchingFocus: vi.fn(),
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
          provide: VoiceRoomStore,
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
          provide: MediasoupSessionService,
          useValue: { produceCamera: vi.fn(), stopCamera: vi.fn() },
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
          useValue: { produceScreen: vi.fn(), stopScreen: vi.fn() },
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

  it('keeps theatre actions on the header line when theatre is open', () => {
    theatreOpen.set(true);
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.componentRef.setInput('room', room);
    fixture.componentRef.setInput('participantsCount', 2);
    fixture.detectChanges();

    const accessories = fixture.nativeElement.querySelector(
      '[tuiAccessories]',
    ) as HTMLElement | null;
    expect(accessories).toBeTruthy();
    expect(
      accessories?.querySelector('app-voice-theatre-actions'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('app-voice-theatre-watch-controls'),
    ).toBeTruthy();
  });

  it('hides theatre-only chrome when theatre is closed', () => {
    const fixture = TestBed.createComponent(VoiceRoomOverlayComponent);
    fixture.componentRef.setInput('room', room);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('app-voice-theatre-actions'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-voice-theatre-watch-controls'),
    ).toBeNull();
  });
});
