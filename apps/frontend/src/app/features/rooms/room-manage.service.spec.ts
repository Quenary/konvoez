import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERoomType, EUserRole, IUser } from '@konvoez/shared';
import { TuiDialogService } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { RoomsActions } from './rooms.actions';
import { IRoom } from './rooms.interface';
import { RoomManageService } from './room-manage.service';

describe('RoomManageService', () => {
  let service: RoomManageService;
  let store: MockStore;

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

    TestBed.configureTestingModule({
      providers: [
        RoomManageService,
        provideTranslateService(),
        provideMockStore({
          selectors: [{ selector: selectCurrentUser, value: me }],
        }),
        { provide: TuiDialogService, useValue: dialogService },
        {
          provide: TuiResponsiveDialogService,
          useValue: responsiveDialogService,
        },
      ],
    });

    service = TestBed.inject(RoomManageService);
    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch');
  });

  it('should allow room management for admin', () => {
    expect(service.canManageRooms()).toBe(true);
  });

  it('should dispatch update room after dialog confirms', async () => {
    dialogService.open.mockReturnValue(
      of({
        id: room.id,
        name: 'renamed',
        avatar: null,
      }),
    );

    await service.editRoom(room);

    expect(store.dispatch).toHaveBeenCalledWith(
      RoomsActions.requestUpdateRoom({
        id: room.id,
        room: { name: 'renamed', avatar: null },
      }),
    );
  });

  it('should dispatch delete room when confirmed', () => {
    responsiveDialogService.open.mockReturnValue(of(true));

    service.deleteRoom(room);

    expect(store.dispatch).toHaveBeenCalledWith(
      RoomsActions.requestDeleteRoom({ id: room.id }),
    );
  });

  it('should not dispatch delete room when confirmation is cancelled', () => {
    responsiveDialogService.open.mockReturnValue(of(false));

    service.deleteRoom(room);

    expect(store.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: RoomsActions.requestDeleteRoom.type,
      }),
    );
  });
});
