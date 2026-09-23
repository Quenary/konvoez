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

import { ConflictException } from '@nestjs/common';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';

import { RoomsService } from './rooms.service';
import { RoomEntity } from './rooms.entity';
import { ERoomType } from '@konvoez/shared';

describe('RoomsService', () => {
  let service: RoomsService;
  let mockRepo: jest.Mocked<EntityRepository<RoomEntity>>;
  let mockEm: jest.Mocked<EntityManager>;

  const author = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Example',
    email: 'alice@example.com',
    role: 'OWNER' as any,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const room = {
    id: 1,
    name: 'Meeting',
    type: ERoomType.TEXT,
    avatar: null,
    author: { id: 1 },
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as RoomEntity;

  beforeEach(() => {
    mockEm = {
      getReference: jest.fn().mockReturnValue({ id: author.id }),
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findOne: jest.fn(),
      create: jest.fn().mockReturnValue(room),
      assign: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<RoomEntity>>;

    service = new RoomsService(mockRepo);
  });

  it('should throw ConflictException if room name is already taken on create', async () => {
    mockRepo.findOne.mockResolvedValueOnce(room as any);

    await expect(
      service.create({ name: 'Meeting', type: ERoomType.TEXT }, author),
    ).rejects.toThrow(new ConflictException('Room name already taken'));
  });

  it('should throw ConflictException if room name is already taken on update', async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(room as any) // findOne(id)
      .mockResolvedValueOnce(room as any); // findOne({ name, id: { $ne: id } })

    await expect(
      service.update(1, { name: 'Meeting' }, author),
    ).rejects.toThrow(new ConflictException('Room name already taken'));
  });
});
