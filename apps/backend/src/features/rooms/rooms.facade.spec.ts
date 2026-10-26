import { ApiErrorCode, ERoomType } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { GetUserSafeDto } from '../users/users.dto';
import { GetRoomDto } from './rooms.dto';
import { RoomEntity } from './rooms.entity';
import { RoomsFacade } from './rooms.facade';
import { RoomsService } from './rooms.service';

describe('RoomsFacade', () => {
  let facade: RoomsFacade;
  let roomsService: jest.Mocked<RoomsService>;

  const mockUser: GetUserSafeDto = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Tester',
    isOwner: false,
    permissions: [],
    avatar: null,
    avatarUrl: null,
    roles: [],
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockRoom: RoomEntity = {
    id: 10,
    name: 'General',
    type: ERoomType.TEXT,
    avatar: null,
    isPrivate: false,
    allowedRoles: { getItems: () => [] },
    allowedUsers: { getItems: () => [] },
    author: { id: 1 } as never,
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as RoomEntity;

  const mockRoomDto: GetRoomDto = {
    id: 10,
    name: 'General',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    author: { id: 1, username: 'alice', fullname: 'Alice Tester' },
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    roomsService = {
      canAccessRoom: jest.fn(),
      findOne: jest.fn(),
      findOneAsSafeDto: jest.fn(),
      findAll: jest.fn(),
      findAllAsSafeDto: jest.fn(),
      findPrivateRooms: jest.fn(),
      deleteRoomsByAuthor: jest.fn(),
      findAvatarKeys: jest.fn(),
    } as unknown as jest.Mocked<RoomsService>;

    facade = new RoomsFacade(roomsService);
  });

  describe('canAccessRoom', () => {
    it('should delegate synchronous access check to roomsService', () => {
      roomsService.canAccessRoom.mockReturnValue(true);

      const result = facade.canAccessRoom(mockUser, mockRoom);

      expect(result).toBe(true);
      expect(roomsService.canAccessRoom).toHaveBeenCalledWith(
        mockUser,
        mockRoom,
      );
    });
  });

  describe('canAccessRoomById', () => {
    it('should return true when room is found and user has access', async () => {
      roomsService.findOne.mockResolvedValue(mockRoom);
      roomsService.canAccessRoom.mockReturnValue(true);

      const result = await facade.canAccessRoomById(mockUser, 10);

      expect(result).toBe(true);
      expect(roomsService.findOne).toHaveBeenCalledWith(10);
      expect(roomsService.canAccessRoom).toHaveBeenCalledWith(
        mockUser,
        mockRoom,
      );
    });

    it('should return false when room is not found or error thrown', async () => {
      roomsService.findOne.mockRejectedValue(
        AppException.notFound(ApiErrorCode.ROOM_NOT_FOUND, 'Not found'),
      );

      const result = await facade.canAccessRoomById(mockUser, 999);

      expect(result).toBe(false);
    });
  });

  describe('assertCanAccessRoom', () => {
    it('should resolve without error when user has access', async () => {
      roomsService.findOne.mockResolvedValue(mockRoom);
      roomsService.canAccessRoom.mockReturnValue(true);

      await expect(facade.assertCanAccessRoom(mockUser, 10)).resolves.toBe(
        mockRoom,
      );
    });

    it('should throw ROOM_ACCESS_DENIED when user lacks access', async () => {
      roomsService.findOne.mockResolvedValue(mockRoom);
      roomsService.canAccessRoom.mockReturnValue(false);

      await expect(
        facade.assertCanAccessRoom(mockUser, 10),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROOM_ACCESS_DENIED,
      });
    });

    it('should propagate not found error from roomsService', async () => {
      roomsService.findOne.mockRejectedValue(
        AppException.notFound(ApiErrorCode.ROOM_NOT_FOUND, 'Room not found'),
      );

      await expect(
        facade.assertCanAccessRoom(mockUser, 999),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROOM_NOT_FOUND,
      });
    });
  });

  describe('getAccessibleRoomIds', () => {
    it('should return set of accessible room ids', async () => {
      roomsService.findAll.mockResolvedValue([
        { id: 10 } as RoomEntity,
        { id: 20 } as RoomEntity,
      ]);

      const ids = await facade.getAccessibleRoomIds(mockUser);

      expect(ids).toEqual(new Set([10, 20]));
      expect(roomsService.findAll).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('findById and findAll', () => {
    it('should delegate findById to roomsService.findOneAsSafeDto', async () => {
      roomsService.findOneAsSafeDto.mockResolvedValue(mockRoomDto);

      const result = await facade.findById(10, mockUser);

      expect(result).toBe(mockRoomDto);
      expect(roomsService.findOneAsSafeDto).toHaveBeenCalledWith(10, mockUser);
    });

    it('should delegate findAll to roomsService.findAllAsSafeDto', async () => {
      roomsService.findAllAsSafeDto.mockResolvedValue([mockRoomDto]);

      const result = await facade.findAll(mockUser);

      expect(result).toEqual([mockRoomDto]);
      expect(roomsService.findAllAsSafeDto).toHaveBeenCalledWith(mockUser);
    });

    it('should delegate findPrivateRooms to roomsService.findPrivateRooms', async () => {
      roomsService.findPrivateRooms.mockResolvedValue([mockRoomDto]);

      const result = await facade.findPrivateRooms();

      expect(result).toEqual([mockRoomDto]);
      expect(roomsService.findPrivateRooms).toHaveBeenCalled();
    });
  });

  describe('deleteRoomsByAuthor', () => {
    it('should delegate deleteRoomsByAuthor to roomsService', async () => {
      roomsService.deleteRoomsByAuthor.mockResolvedValue(undefined);

      await facade.deleteRoomsByAuthor(42);

      expect(roomsService.deleteRoomsByAuthor).toHaveBeenCalledWith(42);
    });
  });

  describe('findAvatarKeys', () => {
    it('should delegate findAvatarKeys to roomsService', async () => {
      roomsService.findAvatarKeys.mockResolvedValue(['avatar-1', 'avatar-2']);

      const keys = await facade.findAvatarKeys();

      expect(keys).toEqual(['avatar-1', 'avatar-2']);
      expect(roomsService.findAvatarKeys).toHaveBeenCalled();
    });
  });
});
