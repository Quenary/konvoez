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
import { EntitySyncDomainEvents } from '@shared/events/entity-sync.events';

describe('RoomsService', () => {
  let service: RoomsService;
  let mockRepo: jest.Mocked<EntityRepository<RoomEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let eventEmitter: { emit: jest.Mock };

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
    author: { id: 1, username: 'alice', fullname: 'Alice Example' },
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as RoomEntity;

  beforeEach(() => {
    mockEm = {
      getReference: jest.fn().mockReturnValue({ id: author.id }),
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      populate: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findOne: jest.fn(),
      create: jest.fn().mockReturnValue(room),
      assign: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<RoomEntity>>;

    eventEmitter = { emit: jest.fn() };
    service = new RoomsService(mockRepo, eventEmitter as never);
  });

  it('should throw ConflictException if room name is already taken on create', async () => {
    mockRepo.findOne.mockResolvedValueOnce(room as any);

    await expect(
      service.create({ name: 'Meeting', type: ERoomType.TEXT }, author),
    ).rejects.toThrow(new ConflictException('Room name already taken'));
  });

  it('should emit ROOM_CREATED after successful create', async () => {
    mockRepo.findOne.mockResolvedValueOnce(null);

    await service.create({ name: 'Meeting', type: ERoomType.TEXT }, author);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EntitySyncDomainEvents.ROOM_CREATED,
      expect.objectContaining({ id: room.id, name: room.name }),
    );
  });

  it('should throw ConflictException if room name is already taken on update', async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(room as any) // findOne(id)
      .mockResolvedValueOnce(room as any); // findOne({ name, id: { $ne: id } })

    await expect(service.update(1, { name: 'Meeting' })).rejects.toThrow(
      new ConflictException('Room name already taken'),
    );
  });

  it('should emit ROOM_UPDATED after successful update', async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(room as any)
      .mockResolvedValueOnce(null);

    await service.update(1, { name: 'Renamed' });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EntitySyncDomainEvents.ROOM_UPDATED,
      expect.objectContaining({ id: room.id }),
    );
  });

  it('should emit ROOM_DELETED after successful remove', async () => {
    mockRepo.findOne.mockResolvedValueOnce(room as any);
    mockEm.remove = jest.fn();

    await service.remove(1);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EntitySyncDomainEvents.ROOM_DELETED,
      { id: 1 },
    );
  });
});
