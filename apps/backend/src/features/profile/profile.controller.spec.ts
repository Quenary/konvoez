import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersService } from '../users/users.service';
import { UsersAvatarsService } from '../users/users-avatars.service';
import { AuthService } from '../auth/auth.service';
import type { GetUserSafeDto, GetUserFullDto } from '../users/users.dto';
import { EUserRole } from '@konvoez/shared';
import type { Response } from 'express';

describe('ProfileController', () => {
  let controller: ProfileController;
  let profileService: jest.Mocked<
    Pick<ProfileService, 'updateSelf' | 'anonymizeSelf' | 'removeSelf'>
  >;
  let authService: jest.Mocked<Pick<AuthService, 'setAuthCookies'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'getAvatarUrl'>>;
  let usersAvatarsService: jest.Mocked<Pick<UsersAvatarsService, 'upload'>>;
  let mockResponse: jest.Mocked<Partial<Response>>;

  const authorSafe: GetUserSafeDto = {
    id: 1,
    username: 'testuser',
    fullname: 'Test User',
    role: EUserRole.MEMBER,
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
  };

  const authorFull: GetUserFullDto = {
    ...authorSafe,
    email: 'test@example.com',
    twoFactorEnabled: false,
  };

  beforeEach(async () => {
    mockResponse = {
      cookie: jest.fn(),
    };

    profileService = {
      updateSelf: jest.fn(),
      anonymizeSelf: jest.fn(),
      removeSelf: jest.fn(),
    };

    authService = {
      setAuthCookies: jest.fn(),
    };

    usersService = {
      getAvatarUrl: jest.fn().mockReturnValue('/avatar/stream'),
    };

    usersAvatarsService = {
      upload: jest.fn().mockResolvedValue('avatar_key'),
    };

    controller = new ProfileController(
      profileService as unknown as ProfileService,
      usersService as unknown as UsersService,
      usersAvatarsService as unknown as UsersAvatarsService,
      authService as unknown as AuthService,
    );
  });

  describe('update', () => {
    it('should update profile and re-issue cookies when sessionVersion is returned', async () => {
      profileService.updateSelf.mockResolvedValueOnce({
        user: authorFull,
        sessionVersion: 2,
      });

      const result = await controller.update(
        { password: 'NewPassword123!' },
        authorSafe,
        mockResponse as unknown as Response,
      );

      expect(profileService.updateSelf).toHaveBeenCalledWith(authorSafe, {
        password: 'NewPassword123!',
      });
      expect(authService.setAuthCookies).toHaveBeenCalledWith(
        authorFull.id,
        2,
        mockResponse,
      );
      expect(result).toBe(authorFull);
    });

    it('should update profile without re-issuing cookies when sessionVersion is not returned', async () => {
      profileService.updateSelf.mockResolvedValueOnce({
        user: authorFull,
        sessionVersion: undefined,
      });

      const result = await controller.update(
        { fullname: 'New Name' },
        authorSafe,
        mockResponse as unknown as Response,
      );

      expect(profileService.updateSelf).toHaveBeenCalledWith(authorSafe, {
        fullname: 'New Name',
      });
      expect(authService.setAuthCookies).not.toHaveBeenCalled();
      expect(result).toBe(authorFull);
    });
  });

  describe('anonymize', () => {
    it('should delegate to profileService.anonymizeSelf', async () => {
      profileService.anonymizeSelf.mockResolvedValueOnce(authorFull);

      const result = await controller.anonymize(authorSafe);

      expect(profileService.anonymizeSelf).toHaveBeenCalledWith(authorSafe);
      expect(result).toBe(authorFull);
    });
  });

  describe('remove', () => {
    it('should delegate to profileService.removeSelf', async () => {
      profileService.removeSelf.mockResolvedValueOnce(undefined);

      await controller.remove(authorSafe);

      expect(profileService.removeSelf).toHaveBeenCalledWith(authorSafe);
    });
  });
});
