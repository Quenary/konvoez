import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERoomType, EUserRole, IUser } from '@konvoez/shared';
import { TuiDialogService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { IRoom } from '@konvoez/shared';
import { RoomManageService } from './room-manage.service';
import { RoomsStore } from '@core/stores/rooms.store';

describe('RoomManageService', () => {
  let service: RoomManageService;
  let roomsStore: {
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  const me: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.ADMIN,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const room: IRoom = {
    id: 10,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const dialogService = {
    open: vi.fn(),
  };

  const responsiveDialogService = {
    open: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    roomsStore = {
      update: vi.fn(),
      remove: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        RoomManageService,
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: RoomsStore, useValue: roomsStore },
        { provide: TuiDialogService, useValue: dialogService },
        {
          provide: TuiResponsiveDialogService,
          useValue: responsiveDialogService,
        },
      ],
    });

    service = TestBed.inject(RoomManageService);
    TestBed.inject(MockStore);
  });

  it('should allow room management for admin', () => {
    expect(service.canManageRooms()).toBe(true);
  });

  it('should update room after dialog confirms', async () => {
    dialogService.open.mockReturnValue(
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
});
