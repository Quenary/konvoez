import { TestBed } from '@angular/core/testing';
import { EUserRole, IUser } from '@konvoez/shared';
import { Store } from '@ngrx/store';
import { TuiDialogService } from '@taiga-ui/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDialogService } from './user-dialog.service';

describe('UserDialogService', () => {
  let service: UserDialogService;
  let dialogService: { open: ReturnType<typeof vi.fn> };
  let currentUser: IUser | null;

  const user: IUser = {
    id: 42,
    username: 'alice',
    fullname: 'Alice Example',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const me: IUser = {
    ...user,
    id: 1,
    username: 'me',
    fullname: 'Current User',
  };

  beforeEach(() => {
    currentUser = me;
    dialogService = {
      open: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        UserDialogService,
        { provide: TuiDialogService, useValue: dialogService },
        {
          provide: Store,
          useValue: { selectSignal: () => () => currentUser },
        },
      ],
    });

    service = TestBed.inject(UserDialogService);
  });

  it('lazily opens the user dialog with the selected user', async () => {
    await service.open(user);

    expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { size: 's', data: { user } },
    );
  });

  it('does not open the user dialog for the current user', async () => {
    currentUser = user;

    await service.open(user);

    expect(dialogService.open).not.toHaveBeenCalled();
  });

  it.each([null, undefined])(
    'does not open the user dialog when the user is %s',
    async (emptyUser) => {
      await service.open(emptyUser);

      expect(dialogService.open).not.toHaveBeenCalled();
    },
  );
});
