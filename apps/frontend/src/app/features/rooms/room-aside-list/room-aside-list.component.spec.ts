import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EPermission,
  ERoomType,
  IRoom,
  IUserFull,
  IUserSafe,
} from '@konvoez/shared';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TuiNotificationService } from '@taiga-ui/core';
import { TuiAsideComponent } from '@taiga-ui/layout';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { UsersStore } from '@core/stores/users.store';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { RoomNavigationService } from '../room-navigation.service';
import { RoomAsideListComponent } from './room-aside-list.component';
import type {
  IRoomPeerWithCanMove,
  IRoomWithPeers,
} from './room-aside-list.component';

describe('RoomAsideListComponent', () => {
  let fixture: ComponentFixture<RoomAsideListComponent>;
  let component: RoomAsideListComponent;
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

  const roomsState = signal<Record<number, Record<number, IUserSafe>>>({
    20: { 2: bob },
  });
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
    roomsState.set({ 20: { 2: bob } });
    hangingCallUserId.set(null);
    interlocutor.set(null);
    entityMap.set({ [me.id]: me, [bob.id]: bob });
    isTouch.set(false);
    roomMentions.set({});
    roomUnreadCount.mockReturnValue(0);

    await TestBed.configureTestingModule({
      imports: [RoomAsideListComponent],
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

    fixture = TestBed.createComponent(RoomAsideListComponent);
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

  it('renders aside items instead of list cells', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[tuiAsideItem]')).toBeTruthy();
    expect(el.querySelector('app-list-item')).toBeNull();
  });

  it('should not allow room management for members', () => {
    expect(component['roomView'].canManageRooms()).toBe(false);
  });

  it('should allow room management for user with MANAGE_ROOMS or owner', () => {
    store.overrideSelector(selectCurrentUser, {
      ...me,
      permissions: [EPermission.MANAGE_ROOMS],
    });
    store.refreshState();
    fixture.detectChanges();

    expect(component['roomView'].canManageRooms()).toBe(true);

    store.overrideSelector(selectCurrentUser, {
      ...me,
      isOwner: true,
      permissions: [],
    });
    store.refreshState();
    fixture.detectChanges();

    expect(component['roomView'].canManageRooms()).toBe(true);
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

  it('exposes voice rooms with peers', () => {
    const rooms = component['voiceRooms']();
    expect(rooms.length).toBe(1);
    expect(rooms[0].name).toBe('lounge');
    expect(rooms[0].peers.length).toBe(1);
    expect(rooms[0].peers[0].username).toBe('bob');
    expect(
      fixture.nativeElement
        .querySelector('app-room-peer')
        ?.hasAttribute('tuiAsideItem'),
    ).toBe(true);
  });

  it('selects a room on click', () => {
    const roomItem: HTMLButtonElement =
      fixture.nativeElement.querySelector('.room-item');
    roomItem.click();
    expect(roomNavigationService.selectRoom).toHaveBeenCalledWith(textRoom);
  });

  it('computes canMoveMembers true for users with MOVE_MEMBERS or owners', () => {
    expect(component['canMoveMembers']()).toBe(false);

    store.overrideSelector(selectCurrentUser, {
      ...me,
      permissions: [EPermission.MOVE_MEMBERS],
    });
    store.refreshState();
    fixture.detectChanges();
    expect(component['canMoveMembers']()).toBe(true);
  });

  it('delegates member move on drop', () => {
    const moved: IRoomPeerWithCanMove = {
      ...bob,
      canMove: true,
    };

    const targetRoom: IRoomWithPeers = {
      ...voiceRoom,
      id: 21,
      peers: [],
      isUserInRoom: false,
    };

    const sourceRoom: IRoomWithPeers = {
      ...voiceRoom,
      peers: [moved],
      isUserInRoom: false,
    };

    const event = {
      item: { data: moved },
      previousContainer: { data: sourceRoom },
    } as unknown as CdkDragDrop<
      IRoomWithPeers,
      IRoomWithPeers,
      IRoomPeerWithCanMove
    >;

    component['onMemberDropped'](event, targetRoom);
    expect(voiceSessionService.moveMember).toHaveBeenCalledWith(2, 21);
  });

  it('sets selectedPeerForMenu on longtap even when user cannot move members', () => {
    const peer: IRoomPeerWithCanMove = { ...bob, canMove: false };
    const room = component['voiceRooms']()[0];

    component['onPeerLongtap'](peer, room);
    expect(component['selectedPeerForMenu']()).toEqual({
      peer,
      roomId: room.id,
    });
  });
});
