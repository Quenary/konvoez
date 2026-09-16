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
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserEntity } from '../users/users.entity';
import { EUserRole } from '@konvoez/shared';
import type { GetUserDto } from '../users/users.dto';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import type { InviteEntity } from './invites.entity';

describe('InvitesService', () => {
  let service: InvitesService;
  let mockRepo: jest.Mocked<EntityRepository<InviteEntity>>;
  let mockEm: jest.Mocked<EntityManager>;

  const mockAuthorUser: GetUserDto = {
    id: 1,
    username: 'admin',
    fullname: 'Administrator',
    email: 'admin@example.com',
    role: EUserRole.ADMIN,
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
      findOne: jest.fn(),
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

    service = new InvitesService(mockRepo);
  });

  describe('create', () => {
    it('should create an invite with generated 32-char hex code and correct expiresAt', async () => {
      const result = await service.create(
        { email: 'user@example.com', ttl: 3600000 },
        mockAuthorUser,
      );

      expect(result.code).toHaveLength(32);
      expect(result.email).toBe('user@example.com');
      expect(result.status).toBe('active');
      expect(mockEm.persist).toHaveBeenCalled();
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should lowercase email if provided', async () => {
      await service.create(
        { email: 'USER@EXAMPLE.COM', ttl: 3600000 },
        mockAuthorUser,
      );

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
        }),
      );
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
          email: 'used@example.com',
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
      await expect(service.revoke(99)).rejects.toThrow(NotFoundException);
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
      ).rejects.toThrow(ForbiddenException);
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
      ).rejects.toThrow('revoked');
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
      ).rejects.toThrow('already been used');
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
      ).rejects.toThrow('expired');
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
      ).rejects.toThrow('bound to another email');
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
});
