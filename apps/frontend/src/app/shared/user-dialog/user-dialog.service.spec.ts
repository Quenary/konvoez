import { TestBed } from '@angular/core/testing';
import { IUserSafe } from '@konvoez/shared';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDialogService } from './user-dialog.service';

describe('UserDialogService', () => {
  let service: UserDialogService;
  let dialogService: { open: ReturnType<typeof vi.fn> };

  const user: IUserSafe = {
    id: 42,
    username: 'alice',
    fullname: 'Alice Example',
    isOwner: false,
    roles: [],
    permissions: [],
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const me: IUserSafe = {
    ...user,
    id: 1,
    username: 'me',
    fullname: 'Current User',
  };

  beforeEach(() => {
    dialogService = {
      open: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        UserDialogService,
        { provide: TuiResponsiveDialogService, useValue: dialogService },
      ],
    });

    service = TestBed.inject(UserDialogService);
  });

  it('lazily opens the user dialog with the selected user', async () => {
    await service.open(user);

    expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        data: { user, withFiles: false, withInput: true },
      },
    );
  });

  it('opens the user dialog for the current user', async () => {
    await service.open(me);

    expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        data: { user: me, withFiles: false, withInput: true },
      },
    );
  });

  it('forwards the files and input flags', async () => {
    await service.open(user, { withFiles: true, withInput: false });

    expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        data: { user, withFiles: true, withInput: false },
      },
    );
  });

  it.each([null, undefined])(
    'does not open the user dialog when the user is %s',
    async (emptyUser) => {
      await service.open(emptyUser);

      expect(dialogService.open).not.toHaveBeenCalled();
    },
  );
});
