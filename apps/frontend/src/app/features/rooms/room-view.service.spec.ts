import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERoomType, IRoom, TVoiceRoomPeerUser } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { RoomManageService } from './room-manage.service';
import { RoomNavigationService } from './room-navigation.service';
import { RoomViewService } from './room-view.service';

describe('RoomViewService', () => {
  let service: RoomViewService;

  const me = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    isOwner: false,
    permissions: [],
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

  const peer = (id: number): TVoiceRoomPeerUser => ({
    id,
    username: `user${id}`,
    fullname: `User ${id}`,
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  });

  const roomMentions = signal<Record<number, number>>({});
  const lobby = signal<Record<number, Record<number, TVoiceRoomPeerUser>>>({});
  const isTouch = signal(false);

  const roomsStore = {
    textRooms: signal([textRoom]),
    voiceRooms: signal([voiceRoom]),
    loadAll: vi.fn(),
  };

  const roomManageService = {
    canManageRooms: signal(false),
  };

  const roomNavigationService = {
    selectRoom: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    roomMentions.set({});
    lobby.set({});
    isTouch.set(false);

    TestBed.configureTestingModule({
      providers: [
        RoomViewService,
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: RoomsStore, useValue: roomsStore },
        { provide: VoiceLobbyStore, useValue: { roomsState: lobby } },
        { provide: RoomManageService, useValue: roomManageService },
        { provide: RoomNavigationService, useValue: roomNavigationService },
        {
          provide: UnreadCountsStore,
          useValue: { roomMentions },
        },
        { provide: WA_IS_TOUCH, useValue: isTouch },
      ],
    });

    service = TestBed.inject(RoomViewService);
  });

  it('loads rooms when created', () => {
    expect(roomsStore.loadAll).toHaveBeenCalled();
  });

  it('flags rooms that have unread mentions', () => {
    roomMentions.set({ 10: 2, 11: 0 });

    expect(service.mentionFlags()).toEqual({ 10: true });
  });

  it('marks the room when the current user is among its peers', () => {
    lobby.set({ 20: { 1: peer(1), 2: peer(2) } });

    const rows = service.voiceRows();
    expect(rows[0].isUserInRoom).toBe(true);
    expect(rows[0].peers.map((item) => item.id)).toEqual([1, 2]);
  });

  it('selects a room on click', () => {
    service.onRoomClick(textRoom);

    expect(roomNavigationService.selectRoom).toHaveBeenCalledWith(textRoom);
  });

  it('does not select a room when the click follows a touch longtap', () => {
    isTouch.set(true);
    service.onRoomLongtap(textRoom);
    service.onRoomClick(textRoom);

    expect(service.contextMenuRoom()).toBe(textRoom);
    expect(roomNavigationService.selectRoom).not.toHaveBeenCalled();
  });
});
