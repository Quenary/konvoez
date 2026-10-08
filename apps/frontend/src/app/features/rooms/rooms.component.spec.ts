import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERoomType, EUserRole, IUser } from '@konvoez/shared';
import { TuiDialogService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { RoomsComponent } from './rooms.component';
import { IRoom } from '@konvoez/shared';
import { RoomManageService } from './room-manage.service';
import { RoomNavigationService } from './room-navigation.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { UsersStore } from '@core/stores/users.store';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';

vi.hoisted(() => {
  (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
    class AudioWorkletNode {};
});

describe('RoomsComponent', () => {
  let fixture: ComponentFixture<RoomsComponent>;
  let component: RoomsComponent;
  let store: MockStore;
  let router: Router;

  const me: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const bob: IUser = {
    id: 2,
    username: 'bob',
    fullname: 'Bob',
    email: 'bob@example.com',
    role: EUserRole.MEMBER,
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
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const roomsState = signal<Record<number, Record<number, IUser>>>({});
  const hangingCallUserId = signal<number | null>(null);
  const interlocutor = signal<IUser | null>(null);
  const entityMap = signal<Record<number, IUser>>({
    [me.id]: me,
    [bob.id]: bob,
  });
  const isTouch = signal(false);

  const usersStore = {
    loadAll: vi.fn(),
    entityMap,
    entities: signal([me, bob]),
  };

  const dialogService = {
    open: vi.fn(),
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

  beforeEach(async () => {
    vi.clearAllMocks();
    roomsState.set({});
    hangingCallUserId.set(null);
    interlocutor.set(null);
    entityMap.set({ [me.id]: me, [bob.id]: bob });
    isTouch.set(false);

    await TestBed.configureTestingModule({
      imports: [RoomsComponent],
      providers: [
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
            roomUnreadCount: vi.fn().mockReturnValue(0),
          },
        },
        { provide: TuiDialogService, useValue: dialogService },
        {
          provide: TuiResponsiveDialogService,
          useValue: responsiveDialogService,
        },
        { provide: WA_IS_TOUCH, useValue: isTouch },
      ],
    })
      .overrideComponent(RoomsComponent, {
        set: {
          // Aside items need TuiAsideComponent parent; test logic only.
          template: '',
          imports: [],
        },
      })
      .compileComponents();

    store = TestBed.inject(MockStore);

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RoomsComponent);
    fixture.componentRef.setInput('collapsed', false);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should request rooms and load users on init', () => {
    expect(roomsStore.loadAll).toHaveBeenCalled();
    expect(usersStore.loadAll).toHaveBeenCalled();
  });

  it('should expose text rooms from the store', () => {
    expect(component['textRooms']()).toEqual([textRoom]);
  });

  it('should not allow room management for members', () => {
    expect(component['canManageRooms']()).toBe(false);
  });

  it('should allow room management for admin or owner', () => {
    store.overrideSelector(selectCurrentUser, {
      ...me,
      role: EUserRole.ADMIN,
    });
    store.refreshState();
    fixture.detectChanges();

    expect(component['canManageRooms']()).toBe(true);

    store.overrideSelector(selectCurrentUser, {
      ...me,
      role: EUserRole.OWNER,
    });
    store.refreshState();
    fixture.detectChanges();

    expect(component['canManageRooms']()).toBe(true);
  });

  describe('voiceRooms', () => {
    it('should attach peers from roomsState and detect current user', () => {
      roomsState.set({
        [voiceRoom.id]: {
          [me.id]: me,
          [bob.id]: bob,
        },
      });
      fixture.detectChanges();

      const rooms = component['voiceRooms']();
      expect(rooms).toHaveLength(1);
      expect(rooms[0].id).toBe(voiceRoom.id);
      expect(rooms[0].peers).toEqual([me, bob]);
      expect(rooms[0].isUserInRoom).toBe(true);
    });

    it('should mark isUserInRoom false when current user is absent', () => {
      roomsState.set({
        [voiceRoom.id]: {
          [bob.id]: bob,
        },
      });
      fixture.detectChanges();

      expect(component['voiceRooms']()[0].isUserInRoom).toBe(false);
    });
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

  it('should call room navigation selectRoom', () => {
    component['selectRoom'](voiceRoom);
    expect(roomNavigationService.selectRoom).toHaveBeenCalledWith(voiceRoom);
  });

  it('should remember room for context menu on longtap', () => {
    component['onRoomLongtap'](textRoom);
    expect(component['contextMenuOpenedFor']()).toEqual(textRoom);
  });

  it('should select room on click', () => {
    component['onRoomClick'](voiceRoom);
    expect(roomNavigationService.selectRoom).toHaveBeenCalledWith(voiceRoom);
  });

  it('should not select room on the click that follows a touch longtap', () => {
    isTouch.set(true);
    component['onRoomLongtap'](textRoom);
    vi.mocked(roomNavigationService.selectRoom).mockClear();

    component['onRoomClick'](textRoom);

    expect(roomNavigationService.selectRoom).not.toHaveBeenCalled();
  });

  it('should select room on click after desktop right-click longtap', () => {
    component['onRoomLongtap'](textRoom);
    vi.mocked(roomNavigationService.selectRoom).mockClear();

    component['onRoomClick'](textRoom);

    expect(roomNavigationService.selectRoom).toHaveBeenCalledWith(textRoom);
  });

  it('should dispatch create room after dialog confirms', async () => {
    dialogService.open.mockReturnValue(
      of({
        name: 'ops',
        type: ERoomType.TEXT,
        avatar: 'avatar.png',
      }),
    );

    await component['addRoom'](ERoomType.TEXT);

    expect(dialogService.open).toHaveBeenCalled();
    expect(roomsStore.create).toHaveBeenCalledWith({
      name: 'ops',
      type: ERoomType.TEXT,
      avatar: 'avatar.png',
    });
  });

  it('should not create room when dialog is cancelled', async () => {
    dialogService.open.mockReturnValue(of(null));
    await component['addRoom'](ERoomType.VOICE);

    expect(roomsStore.create).not.toHaveBeenCalled();
  });

  it('should delegate edit room to RoomManageService', async () => {
    const editRoom = vi.fn().mockResolvedValue(undefined);
    const roomManageService = TestBed.inject(RoomManageService);
    vi.spyOn(roomManageService, 'editRoom').mockImplementation(editRoom);

    await component['editRoom'](voiceRoom);

    expect(editRoom).toHaveBeenCalledWith(voiceRoom);
  });

  it('should delegate delete room to RoomManageService', () => {
    const deleteRoom = vi.fn();
    const roomManageService = TestBed.inject(RoomManageService);
    vi.spyOn(roomManageService, 'deleteRoom').mockImplementation(deleteRoom);

    component['deleteRoom'](textRoom);

    expect(deleteRoom).toHaveBeenCalledWith(textRoom);
  });
});
