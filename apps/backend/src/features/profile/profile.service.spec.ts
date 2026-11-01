jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@mikro-orm/core', () => {
  const createProxy = (): unknown =>
    new Proxy(() => createProxy(), {
      get: () => createProxy(),
      apply: () => createProxy(),
    });
  return {
    defineEntity: () => ({
      class: class {},
      setClass: () => undefined,
      addHook: () => undefined,
    }),
    p: createProxy(),
    Cascade: {},
    EntityManager: class EntityManager {},
  };
});

import { ApiErrorCode, EUserRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import type { GetUserSafeDto, GetUserFullDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { RoomsFacade } from '../rooms/rooms.facade';
import { AuthService } from '../auth/auth.service';
import { MailService } from '@shared/services/mail.service';
import { VerifiedMailerService } from '@shared/services/verified-mailer.service';
import { ProfileService } from './profile.service';
import type { UpdateProfileDto } from './profile.dto';
import { UsersDomainEvents } from '../users/users.events';

describe('ProfileService', () => {
  let service: ProfileService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findOne'
      | 'toSafeDto'
      | 'toSafeDtoWithPermissions'
      | 'toFullDto'
      | 'anonymizeLoaded'
      | 'removeLoaded'
      | 'setPassword'
    >
  >;
  let roomsFacade: jest.Mocked<Pick<RoomsFacade, 'deleteRoomsByAuthor'>>;
  let authService: jest.Mocked<
    Pick<
      AuthService,
      | 'isUserCoolingDown'
      | 'sendVerificationCodeToEmail'
      | 'verifyCodeForUser'
      | 'cancelPendingVerificationCodes'
    >
  >;
  let mailService: { isConfigured: boolean };
  let verifiedMailerService: jest.Mocked<
    Pick<VerifiedMailerService, 'sendNotification'>
  >;
  let eventEmitter: { emit: jest.Mock };

  const mockUser = {
    id: 1,
    username: 'test_user',
    password: 'hashed_password',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    sessionVersion: 0,
    avatar: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as UserEntity;

  const authorPublic: GetUserSafeDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    role: EUserRole.MEMBER,
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const author: GetUserFullDto = {
    ...authorPublic,
    email: 'test@example.com',
    twoFactorEnabled: false,
    emailVerified: true,
    pendingEmail: null,
  };

  beforeEach(() => {
    mockEm = {
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findOne: jest.fn(),
      assign: jest.fn().mockReturnValue(mockUser),
    } as unknown as jest.Mocked<EntityRepository<UserEntity>>;

    usersService = {
      findOne: jest.fn().mockResolvedValue(mockUser),
      toSafeDto: jest.fn().mockReturnValue(authorPublic),
      toSafeDtoWithPermissions: jest.fn().mockResolvedValue(authorPublic),
      toFullDto: jest.fn().mockReturnValue(author),
      anonymizeLoaded: jest.fn().mockResolvedValue(author),
      removeLoaded: jest.fn().mockResolvedValue(undefined),
      setPassword: jest.fn().mockImplementation((user: UserEntity) => {
        user.sessionVersion = (user.sessionVersion ?? 0) + 1;
        return Promise.resolve(user);
      }),
    };

    eventEmitter = { emit: jest.fn() };
    roomsFacade = {
      deleteRoomsByAuthor: jest.fn().mockResolvedValue(undefined),
    };
    authService = {
      isUserCoolingDown: jest.fn().mockResolvedValue(false),
      sendVerificationCodeToEmail: jest.fn().mockResolvedValue(undefined),
      verifyCodeForUser: jest.fn().mockResolvedValue(true),
      cancelPendingVerificationCodes: jest.fn().mockResolvedValue(undefined),
    };
    mailService = {
      isConfigured: false,
    };
    verifiedMailerService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    service = new ProfileService(
      mockRepo,
      usersService as unknown as UsersService,
      roomsFacade as unknown as RoomsFacade,
      eventEmitter as never,
      authService as unknown as AuthService,
      mailService as unknown as MailService,
      verifiedMailerService as unknown as VerifiedMailerService,
    );
  });

  describe('updateSelf', () => {
    it('should throw ConflictException if username is taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateSelf(author, {
          username: 'taken_user',
        } as UpdateProfileDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_USERNAME_TAKEN,
      });
    });

    it('should throw ConflictException if email is taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateSelf(author, {
          email: 'taken@example.com',
        } as UpdateProfileDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_EMAIL_TAKEN,
      });
    });

    it('should update profile fields and return dto', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const dto = {
        username: 'updated',
        email: 'updated@example.com',
        fullname: 'Updated Name',
      } as UpdateProfileDto;

      const result = await service.updateSelf(author, dto);

      expect(usersService.findOne).toHaveBeenCalledWith(author.id);
      expect(mockRepo.assign).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          username: 'updated',
          fullname: 'Updated Name',
        }),
      );
      expect(mockUser.email).toBe('updated@example.com');
      expect(mockEm.persist).toHaveBeenCalledWith(mockUser);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(usersService.toSafeDtoWithPermissions).toHaveBeenCalledWith(
        mockUser,
      );
      expect(usersService.toFullDto).toHaveBeenCalledWith(
        mockUser,
        authorPublic.permissions,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_UPDATED,
        authorPublic,
      );
      expect(result).toEqual({ user: author, sessionVersion: undefined });
    });

    it('should hold old email and send verification code when SMTP is configured', async () => {
      mailService.isConfigured = true;
      mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      mockUser.email = 'test@example.com';
      mockUser.pendingEmail = null;

      const dto = {
        email: 'newemail@example.com',
      } as UpdateProfileDto;

      await service.updateSelf(author, dto);

      expect(mockUser.email).toBe('test@example.com');
      expect(mockUser.pendingEmail).toBe('newemail@example.com');
      expect(authService.sendVerificationCodeToEmail).toHaveBeenCalledWith(
        mockUser,
        'newemail@example.com',
      );
    });

    it('does not keep a pending email when sending the code fails', async () => {
      mailService.isConfigured = true;
      mockUser.email = 'test@example.com';
      mockUser.pendingEmail = null;
      mockRepo.findOne.mockResolvedValueOnce(null);
      authService.sendVerificationCodeToEmail.mockRejectedValueOnce(
        AppException.serviceUnavailable(
          ApiErrorCode.EMAIL_SEND_FAILED,
          'Failed to send email',
        ),
      );

      await expect(
        service.updateSelf(author, {
          email: 'newemail@example.com',
        } as UpdateProfileDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.EMAIL_SEND_FAILED,
      });

      expect(mockUser.pendingEmail).toBeNull();
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it('should delegate password update to usersService.setPassword and return sessionVersion', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.updateSelf(author, {
        password: 'StrongPassword123!',
      } as UpdateProfileDto);

      expect(usersService.setPassword).toHaveBeenCalledWith(
        mockUser,
        'StrongPassword123!',
      );
      expect(result).toEqual({ user: author, sessionVersion: 1 });
    });

    it('should propagate NotFoundException from usersService.findOne', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      usersService.findOne.mockRejectedValueOnce(
        AppException.notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found'),
      );

      await expect(
        service.updateSelf(author, {
          fullname: 'New Name',
        } as UpdateProfileDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_NOT_FOUND,
      });
    });
  });

  describe('anonymizeSelf', () => {
    it('should load the current user and anonymize through UsersService', async () => {
      const result = await service.anonymizeSelf(author);

      expect(usersService.findOne).toHaveBeenCalledWith(author.id);
      expect(usersService.anonymizeLoaded).toHaveBeenCalledWith(mockUser);
      expect(result).toBe(author);
    });

    it('should reject owner self-anonymize', async () => {
      await expect(
        service.anonymizeSelf({ ...author, role: EUserRole.OWNER }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_OWNER_DELETE_FORBIDDEN,
      });
      expect(usersService.anonymizeLoaded).not.toHaveBeenCalled();
    });
  });

  describe('removeSelf', () => {
    it('should remove the current user through UsersService', async () => {
      await service.removeSelf(author);

      expect(roomsFacade.deleteRoomsByAuthor).toHaveBeenCalledWith(author.id);
      expect(usersService.removeLoaded).toHaveBeenCalledWith(author.id);
    });

    it('should reject owner self-removal', async () => {
      await expect(
        service.removeSelf({ ...author, role: EUserRole.OWNER }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_OWNER_DELETE_FORBIDDEN,
      });
      expect(roomsFacade.deleteRoomsByAuthor).not.toHaveBeenCalled();
      expect(usersService.removeLoaded).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmailChange', () => {
    it('throws AUTH_EMAIL_NO_PENDING_CHANGE when no pending email change exists', async () => {
      usersService.findOne.mockResolvedValueOnce({
        ...mockUser,
        pendingEmail: null,
      } as unknown as UserEntity);

      await expect(
        service.confirmEmailChange(author, '123456'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_EMAIL_NO_PENDING_CHANGE,
      });
    });

    it('throws invalid code error when verification code does not match', async () => {
      usersService.findOne.mockResolvedValueOnce({
        ...mockUser,
        pendingEmail: 'new@example.com',
      } as unknown as UserEntity);
      authService.verifyCodeForUser.mockResolvedValueOnce(false);

      await expect(
        service.confirmEmailChange(author, 'wrong-code'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_EMAIL_VERIFICATION_CODE_INVALID,
      });
    });

    it('updates email, marks verified, and notifies both old and new email addresses', async () => {
      const user = {
        ...mockUser,
        email: 'old@example.com',
        emailVerified: true,
        pendingEmail: 'new@example.com',
      } as unknown as UserEntity;
      usersService.findOne.mockResolvedValueOnce(user);
      authService.verifyCodeForUser.mockResolvedValueOnce(true);

      const result = await service.confirmEmailChange(author, '123456');

      expect(user.email).toBe('new@example.com');
      expect(user.pendingEmail).toBeNull();
      expect(user.emailVerified).toBe(true);
      expect(verifiedMailerService.sendNotification).toHaveBeenCalledWith(
        { email: 'old@example.com', emailVerified: true },
        expect.objectContaining({ subject: 'Email address changed' }),
      );
      expect(verifiedMailerService.sendNotification).toHaveBeenCalledWith(
        { email: 'new@example.com', emailVerified: true },
        expect.objectContaining({ subject: 'Email address updated' }),
      );
      expect(result).toBe(author);
    });
  });
});
