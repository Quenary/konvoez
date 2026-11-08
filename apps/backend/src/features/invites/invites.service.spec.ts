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

import { InvitesService } from './invites.service';
import { UserEntity } from '../users/users.entity';
import { ApiErrorCode, EPermission, ESettingKey } from '@konvoez/shared';
import type { MailService } from '@shared/services/mail.service';
import type { SettingsService } from '../settings/settings.service';
import type { GetUserSafeDto } from '../users/users.dto';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import type { InviteEntity } from './invites.entity';

describe('InvitesService', () => {
  let service: InvitesService;
  let mockRepo: jest.Mocked<EntityRepository<InviteEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let mockMailService: {
    isConfigured: boolean;
    sendMail: jest.Mock;
  };
  let mockSettingsService: {
    getValue: jest.Mock;
  };

  const mockAuthorUser: GetUserSafeDto = {
    id: 1,
    username: 'admin',
    fullname: 'Administrator',
    isOwner: false,
    roles: [],
    permissions: [EPermission.MANAGE_INVITES],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockAuthorEntity = {
    id: 1,
    username: 'admin',
    fullname: 'Administrator',
  } as UserEntity;

  beforeEach(() => {
    mockEm = {
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      remove: jest.fn(),
      getReference: jest.fn().mockReturnValue(mockAuthorEntity),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(
        (_entity: unknown, data: Partial<InviteEntity>) =>
          ({
            id: 1,
            createdAt: new Date(),
            updatedAt: null,
            usedAt: null,
            revokedAt: null,
            ...data,
          }) as unknown as InviteEntity,
      ),
      nativeUpdate: jest.fn().mockResolvedValue(1),
      transactional: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
          cb(mockEm),
        ),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      create: jest.fn().mockImplementation(
        (data: Partial<InviteEntity>) =>
          ({
            id: 1,
            createdAt: new Date(),
            updatedAt: null,
            usedAt: null,
            revokedAt: null,
            ...data,
          }) as unknown as InviteEntity,
      ),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<InviteEntity>>;

    mockMailService = {
      isConfigured: true,
      sendMail: jest.fn().mockResolvedValue(undefined),
    };

    mockSettingsService = {
      getValue: jest.fn().mockImplementation(async (key: ESettingKey) => {
        if (key === ESettingKey.APP_URL) return 'https://konvoez.example.com';
        return undefined;
      }),
    };

    service = new InvitesService(
      mockRepo,
      mockMailService as unknown as MailService,
      mockSettingsService as unknown as SettingsService,
    );
  });

  describe('create', () => {
    it('should create an invite with generated 32-char hex code and correct expiresAt', async () => {
      const result = await service.create(
        { email: 'user@example.com', ttl: 3600000, sendEmail: false },
        mockAuthorUser,
      );

      expect(result.code).toHaveLength(32);
      expect(result.email).toBe('user@example.com');
      expect(result.status).toBe('active');
      expect(result.url).toBe(
        `https://konvoez.example.com/auth/register?code=${result.code}&email=user%40example.com`,
      );
      expect(mockEm.transactional).toHaveBeenCalled();
      expect(mockEm.persist).toHaveBeenCalled();
    });

    it('should lowercase email if provided', async () => {
      await service.create(
        { email: 'USER@EXAMPLE.COM', ttl: 3600000, sendEmail: false },
        mockAuthorUser,
      );

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ email: 'user@example.com' }),
      );
    });

    it('should throw INVITE_EMAIL_EXISTS when an active invite already exists for the email', async () => {
      mockEm.findOne.mockResolvedValueOnce({
        id: 99,
        email: 'user@example.com',
      } as InviteEntity);

      await expect(
        service.create(
          { email: 'USER@example.com', ttl: 3600000, sendEmail: false },
          mockAuthorUser,
        ),
      ).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_EMAIL_EXISTS,
      });

      expect(mockEm.transactional).toHaveBeenCalled();
      expect(mockEm.findOne).toHaveBeenCalledWith(expect.anything(), {
        email: 'user@example.com',
        revokedAt: null,
        usedAt: null,
        expiresAt: { $gt: expect.any(Date) },
      });
      expect(mockEm.persist).not.toHaveBeenCalled();
      expect(mockMailService.sendMail).not.toHaveBeenCalled();
    });

    it('should not check for active invite if email is not provided', async () => {
      await service.create({ ttl: 3600000, sendEmail: false }, mockAuthorUser);

      expect(mockEm.findOne).not.toHaveBeenCalled();
    });

    it('should create invite and send email when sendEmail is true and SMTP is configured', async () => {
      const result = await service.create(
        { email: 'user@example.com', ttl: 3600000, sendEmail: true },
        mockAuthorUser,
      );

      expect(mockEm.persist).toHaveBeenCalled();
      expect(mockMailService.sendMail).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Invitation to join Konvoez',
        text: expect.stringContaining(
          'https://konvoez.example.com/auth/register',
        ),
        html: expect.stringContaining(
          'https://konvoez.example.com/auth/register',
        ),
      });
      expect(mockEm.nativeUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { id: 1 },
        { emailSent: true, emailSentAt: expect.any(Date) },
      );
      expect(result.emailSent).toBe(true);
      expect(result.emailSentAt).toBeInstanceOf(Date);
      expect(result.emailSendFailed).toBeUndefined();
    });

    it('should keep the invite and flag emailSendFailed when sendMail fails', async () => {
      mockMailService.sendMail.mockRejectedValueOnce(
        new Error('SMTP connection failure'),
      );

      const result = await service.create(
        { email: 'user@example.com', ttl: 3600000, sendEmail: true },
        mockAuthorUser,
      );

      expect(mockEm.persist).toHaveBeenCalled();
      expect(mockEm.nativeUpdate).not.toHaveBeenCalled();
      expect(result.emailSendFailed).toBe(true);
      expect(result.emailSent).toBe(false);
      expect(result.url).toContain('/auth/register?code=');
    });

    it.each([
      {
        name: 'SMTP is not configured',
        arrange: () => {
          mockMailService.isConfigured = false;
        },
        code: ApiErrorCode.EMAIL_NOT_CONFIGURED,
      },
      {
        name: 'APP_URL is not set',
        arrange: () => {
          mockSettingsService.getValue.mockResolvedValue('');
        },
        code: ApiErrorCode.EMAIL_SEND_FAILED,
      },
    ])(
      'should reject and NOT create invite when sendEmail is true and $name',
      async ({ arrange, code }) => {
        arrange();

        await expect(
          service.create(
            { email: 'user@example.com', ttl: 3600000, sendEmail: true },
            mockAuthorUser,
          ),
        ).rejects.toMatchObject({ code });

        expect(mockEm.transactional).not.toHaveBeenCalled();
        expect(mockEm.persist).not.toHaveBeenCalled();
        expect(mockMailService.sendMail).not.toHaveBeenCalled();
      },
    );

    it('should not send email when sendEmail is false', async () => {
      const result = await service.create(
        { email: 'user@example.com', ttl: 3600000, sendEmail: false },
        mockAuthorUser,
      );

      expect(mockMailService.sendMail).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(false);
      expect(result.emailSentAt).toBeNull();
    });

    it('should not return url when APP_URL is not set', async () => {
      mockSettingsService.getValue.mockResolvedValue('');

      const result = await service.create(
        { email: 'user@example.com', ttl: 3600000, sendEmail: false },
        mockAuthorUser,
      );

      expect(result.url).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return invites with correct status', async () => {
      const now = Date.now();
      mockRepo.find.mockResolvedValue([
        {
          id: 1,
          code: 'active123',
          email: null,
          author: mockAuthorEntity,
          expiresAt: new Date(now + 100000),
          usedAt: null,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: null,
        },
        {
          id: 2,
          code: 'used123',
          author: mockAuthorEntity,
          usedBy: { id: 2, username: 'consumer', fullname: 'Consumer User' },
          expiresAt: new Date(now + 100000),
          usedAt: new Date(),
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: null,
        },
        {
          id: 3,
          code: 'revoked123',
          email: null,
          author: mockAuthorEntity,
          expiresAt: new Date(now + 100000),
          usedAt: null,
          revokedAt: new Date(),
          createdAt: new Date(),
          updatedAt: null,
        },
        {
          id: 4,
          code: 'expired123',
          email: null,
          author: mockAuthorEntity,
          expiresAt: new Date(now - 100000),
          usedAt: null,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: null,
        },
      ] as unknown as InviteEntity[]);

      const invites = await service.findAll();
      expect(invites).toHaveLength(4);
      expect(invites[0].status).toBe('active');
      expect(invites[1].status).toBe('used');
      expect(invites[1].usedBy?.username).toBe('consumer');
      expect(invites[2].status).toBe('revoked');
      expect(invites[3].status).toBe('expired');
    });
  });

  describe('revoke', () => {
    it('should set revokedAt on active invite', async () => {
      const invite = {
        id: 1,
        code: 'active123',
        author: mockAuthorEntity,
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      };
      mockRepo.findOne.mockResolvedValue(invite as unknown as InviteEntity);

      const result = await service.revoke(1);
      expect(invite.revokedAt).toBeInstanceOf(Date);
      expect(result.status).toBe('revoked');
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException if invite does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.revoke(99)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_NOT_FOUND,
      });
    });
  });

  describe('delete', () => {
    it('should physically remove invite', async () => {
      const invite = { id: 1 };
      mockRepo.findOne.mockResolvedValue(invite as unknown as InviteEntity);

      await service.delete(1);
      expect(mockEm.remove).toHaveBeenCalledWith(invite);
      expect(mockEm.flush).toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('should throw ForbiddenException if invite not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.validate('invalid', 'new@example.com'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_INVALID,
      });
    });

    it('should throw ForbiddenException if invite is revoked', async () => {
      mockRepo.findOne.mockResolvedValue({
        code: 'code123',
        revokedAt: new Date(),
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      } as unknown as InviteEntity);
      await expect(
        service.validate('code123', 'new@example.com'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_REVOKED,
      });
    });

    it('should throw ForbiddenException if invite is used', async () => {
      mockRepo.findOne.mockResolvedValue({
        code: 'code123',
        revokedAt: null,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
      } as unknown as InviteEntity);
      await expect(
        service.validate('code123', 'new@example.com'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_USED,
      });
    });

    it('should throw ForbiddenException if invite is expired', async () => {
      mockRepo.findOne.mockResolvedValue({
        code: 'code123',
        revokedAt: null,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      } as unknown as InviteEntity);
      await expect(
        service.validate('code123', 'new@example.com'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_EXPIRED,
      });
    });

    it('should throw ForbiddenException if invite email does not match user email', async () => {
      mockRepo.findOne.mockResolvedValue({
        code: 'code123',
        email: 'other@example.com',
        revokedAt: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      } as unknown as InviteEntity);
      await expect(
        service.validate('code123', 'new@example.com'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_EMAIL_MISMATCH,
      });
    });

    it('should return invite when valid', async () => {
      const validInvite = {
        code: 'code123',
        email: 'new@example.com',
        revokedAt: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      } as unknown as InviteEntity;
      mockRepo.findOne.mockResolvedValue(validInvite);

      const result = await service.validate('code123', 'new@example.com');
      expect(result).toBe(validInvite);
    });
  });

  describe('consume', () => {
    const userToRegister = { id: 2, email: 'new@example.com' } as UserEntity;

    it('should mark invite as used and set usedBy and usedAt', async () => {
      const invite = {
        code: 'code123',
        email: 'new@example.com',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        usedBy: null,
      } as unknown as InviteEntity;

      const result = await service.consume(invite, userToRegister);

      expect(result.usedAt).toBeInstanceOf(Date);
      expect(result.usedBy).toBe(userToRegister);
      expect(mockEm.persist).toHaveBeenCalledWith(invite);
      expect(mockEm.flush).toHaveBeenCalled();
    });
  });

  describe('resend', () => {
    const createSampleActiveInvite = (overrides?: Partial<InviteEntity>) =>
      ({
        id: 1,
        code: 'active123',
        email: 'user@example.com',
        author: mockAuthorEntity,
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        revokedAt: null,
        emailSent: false,
        emailSentAt: null,
        createdAt: new Date(),
        updatedAt: null,
        ...overrides,
      }) as unknown as InviteEntity;

    it('should successfully resend invite email and update emailSent/emailSentAt', async () => {
      const invite = createSampleActiveInvite();
      mockRepo.findOne.mockResolvedValue(invite);

      const result = await service.resend(1, mockAuthorUser);

      expect(mockMailService.sendMail).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Invitation to join Konvoez',
        text: expect.stringContaining(
          'https://konvoez.example.com/auth/register',
        ),
        html: expect.stringContaining(
          'https://konvoez.example.com/auth/register',
        ),
      });
      expect(mockEm.nativeUpdate).toHaveBeenLastCalledWith(
        expect.anything(),
        { id: 1 },
        { emailSent: true },
      );
      expect(invite.emailSent).toBe(true);
      expect(invite.emailSentAt).toBeInstanceOf(Date);
      expect(result.emailSent).toBe(true);
      expect(result.emailSentAt).toBeInstanceOf(Date);
      expect(result.url).toBe(
        `https://konvoez.example.com/auth/register?code=active123&email=user%40example.com`,
      );
    });

    it('should throw RATE_LIMITED and not send when the atomic claim fails (cooldown active)', async () => {
      mockRepo.findOne.mockResolvedValue(
        createSampleActiveInvite({
          emailSent: true,
          emailSentAt: new Date(Date.now() - 3 * 60 * 1000),
        }),
      );
      mockEm.nativeUpdate.mockResolvedValueOnce(0);

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.RATE_LIMITED,
      });

      expect(mockMailService.sendMail).not.toHaveBeenCalled();
    });

    it('should claim the send slot with a cooldown-aware condition', async () => {
      mockRepo.findOne.mockResolvedValue(createSampleActiveInvite());

      await service.resend(1, mockAuthorUser);

      expect(mockEm.nativeUpdate).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        {
          id: 1,
          $or: [
            { emailSentAt: null },
            { emailSentAt: { $lte: expect.any(Date) } },
          ],
        },
        { emailSentAt: expect.any(Date) },
      );
    });

    it('should restore previous emailSentAt when sending fails', async () => {
      const previous = new Date(Date.now() - 11 * 60 * 1000);
      mockRepo.findOne.mockResolvedValue(
        createSampleActiveInvite({ emailSent: true, emailSentAt: previous }),
      );
      mockMailService.sendMail.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.EMAIL_SEND_FAILED,
      });

      expect(mockEm.nativeUpdate).toHaveBeenLastCalledWith(
        expect.anything(),
        { id: 1 },
        { emailSentAt: previous },
      );
    });

    it('should throw INVITE_NOT_FOUND if invite does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.resend(999, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_NOT_FOUND,
      });
    });

    it('should throw INVITE_REVOKED if invite has been revoked', async () => {
      const invite = createSampleActiveInvite({ revokedAt: new Date() });
      mockRepo.findOne.mockResolvedValue(invite);

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_REVOKED,
      });
    });

    it('should throw INVITE_USED if invite has already been used', async () => {
      const invite = createSampleActiveInvite({ usedAt: new Date() });
      mockRepo.findOne.mockResolvedValue(invite);

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_USED,
      });
    });

    it('should throw INVITE_EXPIRED if invite has expired', async () => {
      const invite = createSampleActiveInvite({
        expiresAt: new Date(Date.now() - 5000),
      });
      mockRepo.findOne.mockResolvedValue(invite);

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_EXPIRED,
      });
    });

    it('should throw INVITE_INVALID if invite has no email address', async () => {
      const invite = createSampleActiveInvite({ email: null });
      mockRepo.findOne.mockResolvedValue(invite);

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_INVALID,
      });
    });

    it('should throw EMAIL_NOT_CONFIGURED if SMTP is not configured', async () => {
      mockMailService.isConfigured = false;
      const invite = createSampleActiveInvite();
      mockRepo.findOne.mockResolvedValue(invite);

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.EMAIL_NOT_CONFIGURED,
      });
    });

    it('should throw EMAIL_SEND_FAILED if APP_URL is not set', async () => {
      mockSettingsService.getValue.mockResolvedValue('');
      mockRepo.findOne.mockResolvedValue(createSampleActiveInvite());

      await expect(service.resend(1, mockAuthorUser)).rejects.toMatchObject({
        code: ApiErrorCode.EMAIL_SEND_FAILED,
      });
      expect(mockEm.nativeUpdate).not.toHaveBeenCalled();
    });
  });
});
