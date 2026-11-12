import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { TUI_OPTIONS } from '@taiga-ui/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EVoiceQualityTier } from '@konvoez/shared';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceQualityService } from '@core/services/voice-quality.service';
import { VoiceConnectionStore } from '@core/voice/voice-connection.store';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { RoomNavigationService } from '@features/rooms/room-navigation.service';
import { MobileTabBarComponent } from './mobile-tab-bar.component';

describe('MobileTabBarComponent', () => {
  let fixture: ComponentFixture<MobileTabBarComponent>;
  let component: MobileTabBarComponent;
  let router: Router;

  const mockActiveSession = signal<unknown | null>(null);
  const mockIsConnected = signal(false);
  const mockDirectTotal = signal(0);
  const mockRooms = signal<Record<number, number>>({});

  beforeEach(async () => {
    mockActiveSession.set(null);
    mockIsConnected.set(false);
    mockDirectTotal.set(0);
    mockRooms.set({});

    await TestBed.configureTestingModule({
      imports: [MobileTabBarComponent],
      providers: [
        {
          provide: TUI_OPTIONS,
          useValue: {
            apis: 'stable',
            fontScaling: false,
            scrollbars: 'native',
          },
        },
        provideRouter([
          { path: 'direct', children: [{ path: ':id', children: [] }] },
          { path: 'text-room', children: [{ path: ':id', children: [] }] },
          { path: 'voice-room', children: [{ path: ':id', children: [] }] },
          { path: 'settings', children: [{ path: ':section', children: [] }] },
        ]),
        provideTranslateService(),
        {
          provide: VoiceSessionStore,
          useValue: {
            activeSession: mockActiveSession,
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            isConnected: mockIsConnected,
            isDirectCallContext: signal(false),
            interlocutor: signal(null),
            callWithUserId: signal(null),
          },
        },
        {
          provide: UnreadCountsStore,
          useValue: {
            directTotal: mockDirectTotal,
            rooms: mockRooms,
          },
        },
        {
          provide: RoomsStore,
          useValue: {
            roomsDict: signal({}),
          },
        },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false),
            speakerMuted: signal(false),
            toggleMicrophoneMuted: vi.fn(),
            toggleSpeakerMuted: vi.fn(),
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: signal(null),
            localScreenTrack: signal(null),
          },
        },
        {
          provide: VoiceSessionService,
          useValue: {
            stopCamera: vi.fn(),
            stopScreen: vi.fn(),
          },
        },
        {
          provide: VoiceQualityService,
          useValue: {
            tier: signal(EVoiceQualityTier.EXCELLENT),
            bitrateKbps: signal(64),
          },
        },
        {
          provide: VoiceConnectionStore,
          useValue: {
            state: signal(null),
            audioSuspended: signal(false),
          },
        },
        {
          provide: VoiceLeaveService,
          useValue: {
            leaveFromVoiceUi: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RoomNavigationService,
          useValue: {
            selectRoom: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(MobileTabBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('links each tab to its section', () => {
    const hrefs = [...fixture.nativeElement.querySelectorAll('a')].map(
      (link: HTMLAnchorElement) => link.getAttribute('href'),
    );

    expect(hrefs).toEqual([
      '/direct',
      '/text-room',
      '/voice-room',
      '/settings',
    ]);
  });

  it.each([
    ['/direct', 1],
    ['/direct/123', 1],
    ['/direct?tab=1', 1],
    ['/text-room', 2],
    ['/text-room/45', 2],
    ['/voice-room', 3],
    ['/voice-room/99', 3],
    ['/settings', 4],
    ['/settings/profile', 4],
  ])('on %s highlights tab %i', async (url, index) => {
    await router.navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    expect(nav.style.getPropertyValue(`--tui-tab-${index}`).trim()).toBe(
      'var(--tui-active-color)',
    );
  });

  it('computes unread counts accurately', () => {
    mockDirectTotal.set(5);
    mockRooms.set({ 1: 2, 2: 3 });

    expect(component['directUnreadCount']()).toBe(5);
    expect(component['textRoomsUnreadCount']()).toBe(5);
  });

  it('computes isSessionActive true when voice session or direct call is active', () => {
    expect(component['isSessionActive']()).toBe(false);

    mockActiveSession.set({ roomId: 1 });
    expect(component['isSessionActive']()).toBe(true);

    mockActiveSession.set(null);
    mockIsConnected.set(true);
    expect(component['isSessionActive']()).toBe(true);
  });

  it('hides the call controls bar on an open voice room', async () => {
    mockActiveSession.set({ roomId: 1 });
    await router.navigateByUrl('/voice-room');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('app-call-controls-bar'),
    ).toBeTruthy();

    await router.navigateByUrl('/voice-room/99');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('app-call-controls-bar'),
    ).toBeNull();
  });
});
