import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EPermission, ERoomType, IUserSafe, IUserFull } from '@konvoez/shared';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TuiNotificationService } from '@taiga-ui/core';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { RoomsComponent } from './rooms.component';
import { IRoom } from '@konvoez/shared';
import { RoomNavigationService } from './room-navigation.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { UsersStore } from '@core/stores/users.store';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { TuiAsideComponent } from '@taiga-ui/layout';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';

vi.hoisted(() => {
  (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
    class AudioWorkletNode {};
});

describe('RoomsComponent', () => {
  let fixture: ComponentFixture<RoomsComponent>;
  let component: RoomsComponent;
  let store: MockStore;
  let router: Router;

  const me: IUserFull = {
    id: 1,
    username: 'alice',
    email: 'test@example.com',
    fullname: 'Alice',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    twoFactorEnabled: false,
    emailVerified: true,
    pendingEmail: null,
  };

  const bob: IUserSafe = {
    id: 2,
    username: 'bob',
    fullname: 'Bob',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const textRoom: IRoom = {
    id: 10,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const voiceRoom: IRoom = {
    id: 20,
    name: 'lounge',
    type: ERoomType.VOICE,
    avatar: null,
    avatarUrl: null,
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const roomsState = signal<Record<number, Record<number, IUserSafe>>>({});
  const hangingCallUserId = signal<number | null>(null);
  const interlocutor = signal<IUserSafe | null>(null);
  const roomMentions = signal<Record<number, number>>({});
  const roomUnreadCount = vi.fn().mockReturnValue(0);
  const entityMap = signal<Record<number, IUserSafe>>({
    [me.id]: me,
    [bob.id]: bob,
  });
  const isTouch = signal(false);

  const usersStore = {
    loadAll: vi.fn(),
    entityMap,
    entities: signal([me, bob]),
  };

  const responsiveDialogService = {
    open: vi.fn(),
  };

  const roomsStore = {
    loadAll: vi.fn(),
    create: vi.fn(),
    textRooms: signal([textRoom]),
    voiceRooms: signal([voiceRoom]),
  };

  const roomNavigationService = {
    selectRoom: vi.fn(),
  };

  const voiceSessionService = {
    moveMember: vi.fn().mockResolvedValue(undefined),
    disconnectMember: vi.fn().mockResolvedValue(undefined),
  };

  const userDialogService = {
    open: vi.fn().mockResolvedValue(undefined),
  };

  const tuiNotificationsService = {
    open: vi.fn().mockReturnValue(of(null)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    roomsState.set({});
    hangingCallUserId.set(null);
    interlocutor.set(null);
    entityMap.set({ [me.id]: me, [bob.id]: bob });
    isTouch.set(false);
    roomMentions.set({});
    roomUnreadCount.mockReturnValue(0);

    await TestBed.configureTestingModule({
      imports: [RoomsComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideMockStore({
          initialState: {
            auth: {
              user: me,
              isAuthorized: true,
            },
          },
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: RoomsStore, useValue: roomsStore },
        { provide: RoomNavigationService, useValue: roomNavigationService },
        { provide: VoiceSessionService, useValue: voiceSessionService },
        { provide: UserDialogService, useValue: userDialogService },
        { provide: TuiNotificationService, useValue: tuiNotificationsService },
        {
          provide: VoiceLobbyStore,
          useValue: {
            roomsState,
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            hangingCallUserId,
            interlocutor,
          },
        },
        { provide: UsersStore, useValue: usersStore },
        {
          provide: UnreadCountsStore,
          useValue: {
            directTotal: vi.fn().mockReturnValue(0),
            roomUnreadCount,
            roomMentions,
          },
        },
        {
          provide: TuiResponsiveDialogService,
          useValue: responsiveDialogService,
        },
        { provide: WA_IS_TOUCH, useValue: isTouch },
        { provide: TuiAsideComponent, useValue: { expanded: signal(true) } },
        {
          provide: VoiceAudioPreferencesStore,
          useValue: {
            microphoneMuted: signal(false),
            speakerMuted: signal(false),
          },
        },
        {
          provide: AudioActivityService,
          useValue: { speakingMap: signal({}) },
        },
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RoomsComponent);
    fixture.componentRef.setInput('collapsed', false);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should request rooms and load users on init', () => {
    expect(roomsStore.loadAll).toHaveBeenCalled();
    expect(usersStore.loadAll).toHaveBeenCalled();
  });

  it('should not allow room management for members', () => {
    expect(component['canManageRooms']()).toBe(false);
  });

  it('should allow room management for user with MANAGE_ROOMS or owner', () => {
    store.overrideSelector(selectCurrentUser, {
      ...me,
      permissions: [EPermission.MANAGE_ROOMS],
    });
    store.refreshState();
    fixture.detectChanges();

    expect(component['canManageRooms']()).toBe(true);

    store.overrideSelector(selectCurrentUser, {
      ...me,
      isOwner: true,
      permissions: [],
    });
    store.refreshState();
    fixture.detectChanges();

    expect(component['canManageRooms']()).toBe(true);
  });

  describe('hangingCallPeer', () => {
    it('should resolve peer from users map when hangingCallUserId is present', () => {
      hangingCallUserId.set(bob.id);
      fixture.detectChanges();

      expect(component['hangingCallPeer']()).toEqual(bob);
    });

    it('should return null when hangingCallUserId is missing from users map and no interlocutor', () => {
      entityMap.set({ [me.id]: me });
      hangingCallUserId.set(bob.id);
      fixture.detectChanges();

      expect(component['hangingCallPeer']()).toBeNull();
    });

    it('should fall back to interlocutor when users store has not loaded yet', () => {
      entityMap.set({});
      hangingCallUserId.set(bob.id);
      interlocutor.set(bob);
      fixture.detectChanges();

      expect(component['hangingCallPeer']()).toEqual(bob);
    });

    it('should return null when there is no hanging call', () => {
      hangingCallUserId.set(null);
      expect(component['hangingCallPeer']()).toBeNull();
    });
  });

  it('should navigate to interlocutor chat from hanging call', () => {
    component['openHangingCall'](bob);
    expect(router.navigate).toHaveBeenCalledWith(['/direct', bob.id]);
  });

  it('should dispatch create room after dialog confirms', async () => {
    responsiveDialogService.open.mockReturnValue(
      of({
        name: 'ops',
        type: ERoomType.TEXT,
        avatar: 'avatar.png',
        isPrivate: true,
        allowedRoleIds: [1, 2],
        allowedUserIds: [10],
      }),
    );

    await component['addRoom'](ERoomType.TEXT);

    expect(responsiveDialogService.open).toHaveBeenCalled();
    expect(roomsStore.create).toHaveBeenCalledWith({
      name: 'ops',
      type: ERoomType.TEXT,
      avatar: 'avatar.png',
      isPrivate: true,
      allowedRoleIds: [1, 2],
      allowedUserIds: [10],
    });
  });

  it('should not create room when dialog is cancelled', async () => {
    responsiveDialogService.open.mockReturnValue(of(null));
    await component['addRoom'](ERoomType.VOICE);

    expect(roomsStore.create).not.toHaveBeenCalled();
  });

  it('renders @ badge with accent appearance when room has unread mentions and unread messages', () => {
    roomUnreadCount.mockImplementation((id: number) =>
      id === textRoom.id ? 3 : 0,
    );
    roomMentions.set({ [textRoom.id]: 1 });
    fixture.detectChanges();

    const roomItem = fixture.nativeElement.querySelector('.room-item');
    const badges = roomItem.querySelectorAll('tui-badge-notification');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent.trim()).toBe('@');
    expect(badges[0].getAttribute('appearance')).toBe('accent');
    expect(badges[0].getAttribute('tuislot')).toBe('top');
  });

  it('renders unread count badge when room has unread messages and no mentions', () => {
    roomUnreadCount.mockImplementation((id: number) =>
      id === textRoom.id ? 3 : 0,
    );
    roomMentions.set({ [textRoom.id]: 0 });
    fixture.detectChanges();

    const roomItem = fixture.nativeElement.querySelector('.room-item');
    const badges = roomItem.querySelectorAll('tui-badge-notification');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent.trim()).toBe('3');
    expect(badges[0].getAttribute('tuislot')).toBe('top');
  });

  it('renders no badge when room has neither unread messages nor mentions', () => {
    roomUnreadCount.mockReturnValue(0);
    roomMentions.set({});
    fixture.detectChanges();

    const roomItem = fixture.nativeElement.querySelector('.room-item');
    const badges = roomItem.querySelectorAll('tui-badge-notification');
    expect(badges.length).toBe(0);
  });
});
