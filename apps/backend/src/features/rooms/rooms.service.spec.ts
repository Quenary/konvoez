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

import {
  ApiErrorCode,
  EPermission,
  ERoomType,
  EUserRole,
} from '@konvoez/shared';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';

import { RoomsService } from './rooms.service';
import { RoomEntity } from './rooms.entity';
import { RoomsDomainEvents } from './rooms.events';
import { ROOM_AVATARS_BUCKET } from '@shared/services/file.service';
import { GetUserSafeDto } from '../users/users.dto';

describe('RoomsService', () => {
  let service: RoomsService;
  let mockRepo: jest.Mocked<EntityRepository<RoomEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let eventEmitter: { emit: jest.Mock };
  let fileService: { delete: jest.Mock };

  const author = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Example',
    role: EUserRole.OWNER,
    isOwner: true,
    roles: [],
    permissions: Object.values(EPermission),
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as GetUserSafeDto;

  const room = {
    id: 1,
    name: 'Meeting',
    type: ERoomType.TEXT,
    avatar: null,
    author: { id: 1, username: 'alice', fullname: 'Alice Example' },
    isPrivate: false,
    allowedRoles: { getItems: () => [] },
    allowedUsers: { getItems: () => [] },
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as RoomEntity;

  beforeEach(() => {
    mockEm = {
      getReference: jest.fn().mockReturnValue({ id: author.id }),
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      populate: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      nativeDelete: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findOne: jest.fn(),
      findAll: jest.fn().mockResolvedValue([room]),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockReturnValue(room),
      assign: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<RoomEntity>>;

    eventEmitter = { emit: jest.fn() };
    fileService = { delete: jest.fn().mockResolvedValue(undefined) };
    const permissionsFacade = {
      findRolesByIds: jest.fn().mockResolvedValue([]),
    };
    const usersService = {
      findByIds: jest.fn().mockResolvedValue([]),
    };
    service = new RoomsService(
      mockRepo,
      eventEmitter as never,
      permissionsFacade as never,
      usersService as never,
      fileService as never,
    );
  });

  it('should throw AppException if room name is already taken on create', async () => {
    mockRepo.findOne.mockResolvedValueOnce(room);

    await expect(
      service.create({ name: 'Meeting', type: ERoomType.TEXT }, author),
    ).rejects.toMatchObject({
      code: ApiErrorCode.ROOM_NAME_TAKEN,
    });
  });

  it('should emit ROOM_CREATED after successful create', async () => {
    mockRepo.findOne.mockResolvedValueOnce(null);

    await service.create({ name: 'Meeting', type: ERoomType.TEXT }, author);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      RoomsDomainEvents.ROOM_CREATED,
      expect.objectContaining({ id: room.id, name: room.name }),
    );
  });

  it('should throw AppException if room name is already taken on update', async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(room) // findOne(id)
      .mockResolvedValueOnce(room); // findOne({ name, id: { $ne: id } })

    await expect(service.update(1, { name: 'Meeting' })).rejects.toMatchObject({
      code: ApiErrorCode.ROOM_NAME_TAKEN,
    });
  });

  it('should emit ROOM_UPDATED after successful update', async () => {
    mockRepo.findOne.mockResolvedValueOnce(room).mockResolvedValueOnce(null);

    await service.update(1, { name: 'Renamed' });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      RoomsDomainEvents.ROOM_UPDATED,
      expect.objectContaining({ id: room.id }),
    );
  });

  it('should emit ROOM_DELETED after successful remove', async () => {
    mockRepo.findOne.mockResolvedValueOnce({
      ...room,
      avatar: 'room-avatar.webp',
    } as unknown as RoomEntity);
    mockEm.remove = jest.fn();

    await service.remove(1);

    expect(fileService.delete).toHaveBeenCalledWith(
      'room-avatar.webp',
      ROOM_AVATARS_BUCKET,
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      RoomsDomainEvents.ROOM_DELETED,
      { id: 1 },
    );
  });

  describe('canAccessRoom', () => {
    it('always allows owner access', () => {
      const privateRoom = {
        ...room,
        isPrivate: true,
        allowedUsers: { getItems: () => [] },
        allowedRoles: { getItems: () => [] },
      } as unknown as RoomEntity;

      expect(service.canAccessRoom(author, privateRoom)).toBe(true);
    });

    it('allows user with MANAGE_ROOMS permission', () => {
      const moderator = {
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROOMS],
        roles: [],
      } as unknown as GetUserSafeDto;

      const privateRoom = {
        ...room,
        isPrivate: true,
        allowedUsers: { getItems: () => [] },
        allowedRoles: { getItems: () => [] },
      } as unknown as RoomEntity;

      expect(service.canAccessRoom(moderator, privateRoom)).toBe(true);
    });

    it('denies user without permission or matching id/role to private room', () => {
      const normalUser = {
        id: 3,
        isOwner: false,
        permissions: [EPermission.SEND_MESSAGES],
        roles: [{ id: 10 }],
      } as unknown as GetUserSafeDto;

      const privateRoom = {
        ...room,
        isPrivate: true,
        allowedUsers: { getItems: () => [{ id: 99 }] },
        allowedRoles: { getItems: () => [{ id: 20 }] },
      } as unknown as RoomEntity;

      expect(service.canAccessRoom(normalUser, privateRoom)).toBe(false);
    });

    it('allows user explicitly listed in allowedUsers', () => {
      const normalUser = {
        id: 3,
        isOwner: false,
        permissions: [],
        roles: [],
      } as unknown as GetUserSafeDto;

      const privateRoom = {
        ...room,
        isPrivate: true,
        allowedUsers: { getItems: () => [{ id: 3 }] },
        allowedRoles: { getItems: () => [] },
      } as unknown as RoomEntity;

      expect(service.canAccessRoom(normalUser, privateRoom)).toBe(true);
    });

    it('allows user whose role is in allowedRoles', () => {
      const normalUser = {
        id: 3,
        isOwner: false,
        permissions: [],
        roles: [{ id: 42 }],
      } as unknown as GetUserSafeDto;

      const privateRoom = {
        ...room,
        isPrivate: true,
        allowedUsers: { getItems: () => [] },
        allowedRoles: { getItems: () => [{ id: 42 }] },
      } as unknown as RoomEntity;

      expect(service.canAccessRoom(normalUser, privateRoom)).toBe(true);
    });
  });

  describe('deleteRoomsByAuthor', () => {
    it('deletes rooms by author and emits ROOM_DELETED for each', async () => {
      mockRepo.find.mockResolvedValueOnce([
        { id: 10, avatar: 'avatar-10' } as RoomEntity,
        { id: 20, avatar: null } as unknown as RoomEntity,
      ]);

      const result = await service.deleteRoomsByAuthor(5);

      expect(result).toBeUndefined();
      expect(mockRepo.find).toHaveBeenCalledWith({ author: 5 });
      expect(mockEm.nativeDelete).toHaveBeenCalledWith(RoomEntity, {
        id: { $in: [10, 20] },
      });
      expect(fileService.delete).toHaveBeenCalledWith(
        'avatar-10',
        ROOM_AVATARS_BUCKET,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        RoomsDomainEvents.ROOM_DELETED,
        { id: 10 },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        RoomsDomainEvents.ROOM_DELETED,
        { id: 20 },
      );
    });

    it('does nothing when author has no rooms', async () => {
      mockRepo.find.mockResolvedValueOnce([]);

      const result = await service.deleteRoomsByAuthor(5);

      expect(result).toBeUndefined();
      expect(mockEm.nativeDelete).not.toHaveBeenCalled();
      expect(fileService.delete).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('findAvatarKeys', () => {
    it('returns non-null avatar keys', async () => {
      mockRepo.find.mockResolvedValueOnce([
        { avatar: 'avatar-1' } as RoomEntity,
        { avatar: null } as unknown as RoomEntity,
        { avatar: 'avatar-2' } as RoomEntity,
      ]);

      const keys = await service.findAvatarKeys();

      expect(keys).toEqual(['avatar-1', 'avatar-2']);
      expect(mockRepo.find).toHaveBeenCalledWith(
        { avatar: { $ne: null } },
        { fields: ['avatar'] },
      );
    });
  });
});
