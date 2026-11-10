import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiAsideComponent } from '@taiga-ui/layout';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EPermission, ERoomType, IRoom, IUserFull } from '@konvoez/shared';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { RoomAsideListComponent } from './room-aside-list.component';
import { RoomManageService } from '../room-manage.service';
import { RoomNavigationService } from '../room-navigation.service';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import type {
  IRoomPeerWithCanMove,
  IRoomWithPeers,
} from './room-aside-list.component';

describe('RoomAsideListComponent', () => {
  let fixture: ComponentFixture<RoomAsideListComponent>;
  let component: RoomAsideListComponent;
  let store: MockStore;

  const me: IUserFull = {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
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

  const bob = {
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

  const mockRoomsStore = {
    textRooms: signal([textRoom]),
    voiceRooms: signal([voiceRoom]),
    loadAll: vi.fn(),
  };

  const mockVoiceSessionService = {
    moveMember: vi.fn().mockResolvedValue(undefined),
    disconnectMember: vi.fn().mockResolvedValue(undefined),
  };

  const mockRoomNavigationService = {
    selectRoom: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomAsideListComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: TuiAsideComponent, useValue: { expanded: signal(true) } },
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: RoomsStore, useValue: mockRoomsStore },
        {
          provide: VoiceLobbyStore,
          useValue: {
            roomsState: signal({
              20: { 2: bob },
            }),
          },
        },
        { provide: VoiceSessionService, useValue: mockVoiceSessionService },
        {
          provide: RoomManageService,
          useValue: {
            canManageRooms: signal(false),
            openRoomDetails: vi.fn(),
            editRoom: vi.fn().mockResolvedValue(undefined),
            deleteRoom: vi.fn(),
          },
        },
        { provide: RoomNavigationService, useValue: mockRoomNavigationService },
        {
          provide: UnreadCountsStore,
          useValue: {
            roomMentions: signal<Record<number, number>>({}),
            roomUnreadCount: vi.fn().mockReturnValue(0),
          },
        },
        { provide: UserDialogService, useValue: { open: vi.fn() } },
        { provide: WA_IS_TOUCH, useValue: () => false },
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
    fixture = TestBed.createComponent(RoomAsideListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('type', ERoomType.TEXT);
    fixture.detectChanges();
  });

  it('renders aside items instead of list cells', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[tuiAsideItem]')).toBeTruthy();
    expect(el.querySelector('app-list-item')).toBeNull();
  });

  it('exposes voice rooms with peers when type is VOICE', () => {
    fixture.componentRef.setInput('type', ERoomType.VOICE);
    fixture.detectChanges();

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
    component['onRoomClick'](textRoom);
    expect(mockRoomNavigationService.selectRoom).toHaveBeenCalledWith(textRoom);
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
    expect(mockVoiceSessionService.moveMember).toHaveBeenCalledWith(2, 21);
  });
});
