import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/users.entity';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

describe('TwoFactorController', () => {
  let controller: TwoFactorController;
  let fakeTwoFactorService: Partial<TwoFactorService>;
  let fakeUsersService: Partial<UsersService>;
  let fakeAuthService: Partial<AuthService>;
  let fakeResponse: Response;

  const mockAuthor = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
  };

  const mockUser = {
    id: 1,
    username: 'alice',
    sessionVersion: 2,
  } as UserEntity;

  beforeEach(async () => {
    fakeResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;

    fakeTwoFactorService = {
      beginSetup: jest.fn(async () => ({
        secret: 'TESTSECRET',
        otpauthUri: 'otpauth://totp/...',
      })),
      confirmSetup: jest.fn(async () => ({
        recoveryCodes: ['code1', 'code2'],
        sessionVersion: 3,
      })),
      disable: jest.fn(async () => 4),
      regenerateRecoveryCodes: jest.fn(async () => ({
        recoveryCodes: ['code3', 'code4'],
        sessionVersion: 5,
      })),
    };

    fakeUsersService = {
      findOne: jest.fn(async () => mockUser),
    };

    fakeAuthService = {
      setAuthCookies: jest.fn(),
    };

    controller = new TwoFactorController(
      fakeTwoFactorService as TwoFactorService,
      fakeUsersService as UsersService,
      fakeAuthService as AuthService,
    );
  });

  it('setup delegates to twoFactorService.beginSetup', async () => {
    const res = await controller.setup({ password: 'secret' }, mockAuthor);
    expect(res.secret).toBe('TESTSECRET');
    expect(fakeTwoFactorService.beginSetup).toHaveBeenCalledWith(
      mockUser,
      'secret',
    );
  });

  it('enable reissues cookies with updated session version', async () => {
    const res = await controller.enable(
      { code: '123456' },
      mockAuthor,
      fakeResponse,
    );
    expect(res.recoveryCodes).toEqual(['code1', 'code2']);
    expect(fakeAuthService.setAuthCookies).toHaveBeenCalledWith(
      mockAuthor.id,
      3,
      fakeResponse,
    );
  });

  it('disable reissues cookies with updated session version', async () => {
    await controller.disable(
      { password: 'secret', code: '123456' },
      mockAuthor,
      fakeResponse,
    );
    expect(fakeAuthService.setAuthCookies).toHaveBeenCalledWith(
      mockAuthor.id,
      4,
      fakeResponse,
    );
  });

  it('regenerateRecoveryCodes reissues cookies with updated session version', async () => {
    const res = await controller.regenerateRecoveryCodes(
      { password: 'secret', code: '123456' },
      mockAuthor,
      fakeResponse,
    );
    expect(res.recoveryCodes).toEqual(['code3', 'code4']);
    expect(fakeAuthService.setAuthCookies).toHaveBeenCalledWith(
      mockAuthor.id,
      5,
      fakeResponse,
    );
  });
});
