import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EPermission, ERoomType, IUserFull } from '@konvoez/shared';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { IRoom } from '@konvoez/shared';
import { RoomManageService } from './room-manage.service';
import { RoomsStore } from '@core/stores/rooms.store';

describe('RoomManageService', () => {
  let service: RoomManageService;
  let store: MockStore;
  let roomsStore: {
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    reorder: ReturnType<typeof vi.fn>;
    textRooms: ReturnType<typeof signal<IRoom[]>>;
    voiceRooms: ReturnType<typeof signal<IRoom[]>>;
  };

  const me: IUserFull = {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    fullname: 'Alice',
    isOwner: false,
    roles: [],
    permissions: [EPermission.MANAGE_ROOMS],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    twoFactorEnabled: false,
    emailVerified: true,
    pendingEmail: null,
  };

  const room: IRoom = {
    id: 10,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    order: 0,
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const responsiveDialogService = {
    open: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    roomsStore = {
      update: vi.fn(),
      remove: vi.fn(),
      reorder: vi.fn(),
      textRooms: signal([
        room,
        { ...room, id: 20, name: 'second', order: 1 },
        { ...room, id: 30, name: 'third', order: 2 },
      ]),
      voiceRooms: signal([]),
    };

    TestBed.configureTestingModule({
      providers: [
        RoomManageService,
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: RoomsStore, useValue: roomsStore },
        {
          provide: TuiResponsiveDialogService,
          useValue: responsiveDialogService,
        },
      ],
    });

    service = TestBed.inject(RoomManageService);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  it('should allow room management for admin', () => {
    expect(service.canManageRooms()).toBe(true);
  });

  it('should update room after dialog confirms', async () => {
    responsiveDialogService.open.mockReturnValue(
      of({
        id: room.id,
        name: 'renamed',
        avatar: null,
      }),
    );

    await service.editRoom(room);

    expect(roomsStore.update).toHaveBeenCalledWith({
      id: room.id,
      room: { name: 'renamed', avatar: null },
    });
  });

  it('should remove room when confirmed', () => {
    responsiveDialogService.open.mockReturnValue(of(true));

    service.deleteRoom(room);

    expect(roomsStore.remove).toHaveBeenCalledWith(room.id);
  });

  it('should not remove room when confirmation is cancelled', () => {
    responsiveDialogService.open.mockReturnValue(of(false));

    service.deleteRoom(room);

    expect(roomsStore.remove).not.toHaveBeenCalled();
  });

  it('should open room details dialog', async () => {
    responsiveDialogService.open.mockReturnValue(of(undefined));

    await service.openRoomDetails(room);

    expect(responsiveDialogService.open).toHaveBeenCalledWith(
      expect.anything(),
      {
        closable: true,
        data: room,
      },
    );
  });

  it('moves room down by 1 index', () => {
    service.moveRoom(room, 'down');
    expect(roomsStore.reorder).toHaveBeenCalledWith([20, 10, 30]);
  });

  it('moves room up by 1 index', () => {
    service.moveRoom({ ...room, id: 20 }, 'up');
    expect(roomsStore.reorder).toHaveBeenCalledWith([20, 10, 30]);
  });

  it('does nothing when moving top room up or bottom room down', () => {
    service.moveRoom(room, 'up');
    expect(roomsStore.reorder).not.toHaveBeenCalled();

    service.moveRoom({ ...room, id: 30 }, 'down');
    expect(roomsStore.reorder).not.toHaveBeenCalled();
  });

  it('reorders rooms by drag-drop indices', () => {
    service.reorderRooms(ERoomType.TEXT, 0, 2);
    expect(roomsStore.reorder).toHaveBeenCalledWith([20, 30, 10]);
  });

  it('ignores reordering when indices are identical or invalid', () => {
    service.reorderRooms(ERoomType.TEXT, 1, 1);
    expect(roomsStore.reorder).not.toHaveBeenCalled();

    service.reorderRooms(ERoomType.TEXT, -1, 2);
    expect(roomsStore.reorder).not.toHaveBeenCalled();
  });

  it('does not move or reorder rooms when user lacks manage rooms permission', () => {
    store.overrideSelector(selectCurrentUser, {
      ...me,
      isOwner: false,
      permissions: [],
    });
    store.refreshState();

    service.moveRoom(room, 'down');
    expect(roomsStore.reorder).not.toHaveBeenCalled();

    service.reorderRooms(ERoomType.TEXT, 0, 1);
    expect(roomsStore.reorder).not.toHaveBeenCalled();
  });
});
