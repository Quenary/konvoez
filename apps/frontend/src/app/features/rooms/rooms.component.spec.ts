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
import { RoomsComponent } from './rooms.component';
import { RoomsActions } from './rooms.actions';
import { IRoom } from './rooms.interface';
import { VoiceRoomService } from '@core/services/voice-room.service';
import {
  DirectCallService,
  ECallStatus,
  IActiveCall,
} from '@core/services/direct-call.service';
import { UsersStore } from '@features/users/users.store';
import { UnreadCountsStore } from '@features/text-room/unread-counts.store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import {
  selectSelectedRoomId,
  selectTextRoomsList,
  selectVoiceRoomsList,
} from './rooms.selectors';

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
    createdAt: new Date(),
    updatedAt: null,
  };

  const voiceRoom: IRoom = {
    id: 20,
    name: 'lounge',
    type: ERoomType.VOICE,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const roomsState = signal<Record<number, Record<number, IUser>>>({});
  const selectedRoomId = signal<number | null>(null);
  const activeCall = signal<IActiveCall | null>(null);
  const rejoinableCall = signal<{
    callId: string;
    callerId: number;
    recipientId: number;
  } | null>(null);
  const entityMap = signal<Record<number, IUser>>({
    [me.id]: me,
    [bob.id]: bob,
  });

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

  const asProtected = () =>
    component as unknown as {
      voiceRooms: () => Array<{
        id: number;
        peers: IUser[];
        isUserInRoom: boolean;
      }>;
      hangingCallPeer: () => IUser | null;
      textRooms: () => IRoom[];
      canManageRooms: () => boolean;
      openHangingCall: (peer: IUser) => void;
      selectRoom: (room: IRoom) => void;
      addRoom: (type: ERoomType) => Promise<void>;
      editRoom: (room: IRoom) => Promise<void>;
      deleteRoom: (room: IRoom) => void;
    };

  beforeEach(async () => {
    vi.clearAllMocks();
    roomsState.set({});
    selectedRoomId.set(null);
    activeCall.set(null);
    rejoinableCall.set(null);
    entityMap.set({ [me.id]: me, [bob.id]: bob });

    await TestBed.configureTestingModule({
      imports: [RoomsComponent],
      providers: [
        provideTranslateService(),
        provideMockStore({
          initialState: {
            rooms: {
              ids: [textRoom.id, voiceRoom.id],
              entities: {
                [textRoom.id]: textRoom,
                [voiceRoom.id]: voiceRoom,
              },
              selectedRoomId: null,
            },
            auth: {
              user: me,
              isAuthorized: true,
            },
          },
          selectors: [
            { selector: selectCurrentUser, value: me },
            { selector: selectSelectedRoomId, value: null },
            { selector: selectTextRoomsList, value: [textRoom] },
            { selector: selectVoiceRoomsList, value: [voiceRoom] },
          ],
        }),
        {
          provide: VoiceRoomService,
          useValue: {
            selectedRoomId,
            roomsState,
          },
        },
        {
          provide: DirectCallService,
          useValue: {
            activeCall,
            rejoinableCall,
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
    vi.spyOn(store, 'dispatch');

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
    expect(store.dispatch).toHaveBeenCalledWith(RoomsActions.requestRooms());
    expect(usersStore.loadAll).toHaveBeenCalled();
  });

  it('should expose text rooms from the store', () => {
    expect(asProtected().textRooms()).toEqual([textRoom]);
  });

  it('should not allow room management for members', () => {
    expect(asProtected().canManageRooms()).toBe(false);
  });

  it('should allow room management for admin or owner', () => {
    store.overrideSelector(selectCurrentUser, {
      ...me,
      role: EUserRole.ADMIN,
    });
    store.refreshState();
    fixture.detectChanges();

    expect(asProtected().canManageRooms()).toBe(true);

    store.overrideSelector(selectCurrentUser, {
      ...me,
      role: EUserRole.OWNER,
    });
    store.refreshState();
    fixture.detectChanges();

    expect(asProtected().canManageRooms()).toBe(true);
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

      const rooms = asProtected().voiceRooms();
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

      expect(asProtected().voiceRooms()[0].isUserInRoom).toBe(false);
    });
  });

  describe('hangingCallPeer', () => {
    it('should return interlocutor for a connected active call', () => {
      activeCall.set({
        callId: 'c1',
        interlocutor: bob,
        isCaller: true,
        status: ECallStatus.CONNECTED,
      });
      fixture.detectChanges();

      expect(asProtected().hangingCallPeer()).toEqual(bob);
    });

    it('should return interlocutor while calling', () => {
      activeCall.set({
        callId: 'c1',
        interlocutor: bob,
        isCaller: true,
        status: ECallStatus.CALLING,
      });
      fixture.detectChanges();

      expect(asProtected().hangingCallPeer()).toEqual(bob);
    });

    it('should ignore incoming active call and fall back to rejoinable', () => {
      activeCall.set({
        callId: 'c1',
        interlocutor: bob,
        isCaller: false,
        status: ECallStatus.INCOMING,
      });
      rejoinableCall.set({
        callId: 'c2',
        callerId: bob.id,
        recipientId: me.id,
      });
      fixture.detectChanges();

      expect(asProtected().hangingCallPeer()).toEqual(bob);
    });

    it('should resolve rejoinable peer from users map', () => {
      rejoinableCall.set({
        callId: 'c1',
        callerId: me.id,
        recipientId: bob.id,
      });
      fixture.detectChanges();

      expect(asProtected().hangingCallPeer()).toEqual(bob);
    });

    it('should return null when rejoinable peer is missing from users', () => {
      entityMap.set({ [me.id]: me });
      rejoinableCall.set({
        callId: 'c1',
        callerId: me.id,
        recipientId: bob.id,
      });
      fixture.detectChanges();

      expect(asProtected().hangingCallPeer()).toBeNull();
    });

    it('should return null when there is no active or rejoinable call', () => {
      expect(asProtected().hangingCallPeer()).toBeNull();
    });
  });

  it('should navigate to interlocutor chat from hanging call', () => {
    asProtected().openHangingCall(bob);
    expect(router.navigate).toHaveBeenCalledWith(['/direct', bob.id]);
  });

  it('should dispatch selectRoom', () => {
    asProtected().selectRoom(voiceRoom);
    expect(store.dispatch).toHaveBeenCalledWith(
      RoomsActions.selectRoom({ room: voiceRoom }),
    );
  });

  it('should dispatch create room after dialog confirms', async () => {
    dialogService.open.mockReturnValue(
      of({
        name: 'ops',
        type: ERoomType.TEXT,
        avatar: 'avatar.png',
      }),
    );

    await asProtected().addRoom(ERoomType.TEXT);

    expect(dialogService.open).toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalledWith(
      RoomsActions.requestCreateRoom({
        room: {
          name: 'ops',
          type: ERoomType.TEXT,
          avatar: 'avatar.png',
        },
      }),
    );
  });

  it('should not dispatch create room when dialog is cancelled', async () => {
    dialogService.open.mockReturnValue(of(null));
    await asProtected().addRoom(ERoomType.VOICE);

    expect(store.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: RoomsActions.requestCreateRoom.type,
      }),
    );
  });

  it('should dispatch update room after dialog confirms', async () => {
    dialogService.open.mockReturnValue(
      of({
        id: voiceRoom.id,
        name: 'renamed',
        avatar: null,
      }),
    );

    await asProtected().editRoom(voiceRoom);

    expect(store.dispatch).toHaveBeenCalledWith(
      RoomsActions.requestUpdateRoom({
        id: voiceRoom.id,
        room: { name: 'renamed', avatar: null },
      }),
    );
  });

  it('should dispatch delete room when confirmed', () => {
    responsiveDialogService.open.mockReturnValue(of(true));

    asProtected().deleteRoom(textRoom);

    expect(responsiveDialogService.open).toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalledWith(
      RoomsActions.requestDeleteRoom({ id: textRoom.id }),
    );
  });

  it('should not dispatch delete room when confirmation is cancelled', () => {
    responsiveDialogService.open.mockReturnValue(of(false));

    asProtected().deleteRoom(textRoom);

    expect(store.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: RoomsActions.requestDeleteRoom.type,
      }),
    );
  });
});
