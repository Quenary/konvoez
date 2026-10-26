import { MentionsService } from './mentions.service';
import { UsersService } from '../users/users.service';
import { PermissionsFacade } from '../permissions/permissions.facade';
import { RoomsFacade } from '../rooms/rooms.facade';
import { EntityRepository, EntityManager } from '@mikro-orm/core';
import { MessageMentionEntity } from './text-rooms.entity';
import { EPermission } from '@konvoez/shared';
import { GetUserSafeDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { RoleEntity } from '../roles/roles.entity';
import { RoomEntity } from '../rooms/rooms.entity';

describe('MentionsService', () => {
  let service: MentionsService;
  let usersService: jest.Mocked<UsersService>;
  let permissionsFacade: jest.Mocked<PermissionsFacade>;
  let roomsFacade: jest.Mocked<RoomsFacade>;
  let messageMentionRepository: jest.Mocked<
    EntityRepository<MessageMentionEntity>
  >;

  const createAuthor = (
    id: number,
    isOwner = false,
    permissions: EPermission[] = [],
  ): GetUserSafeDto => ({
    id,
    username: `author${id}`,
    fullname: `Author ${id}`,
    isOwner,
    roles: [],
    permissions,
    createdAt: new Date(),
    updatedAt: new Date(),
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
  });

  const createUser = (id: number, deletedAt: Date | null = null): UserEntity =>
    ({
      id,
      username: `user${id}`,
      fullname: `User ${id}`,
      deletedAt,
      roles: {
        isInitialized: () => true,
        getItems: () => [],
      },
    }) as unknown as UserEntity;

  const createRole = (
    id: number,
    mentionable = false,
    name = `role${id}`,
  ): RoleEntity =>
    ({
      id,
      name,
      mentionable,
    }) as unknown as RoleEntity;

  const dummyRoom = { id: 10, isPrivate: false } as RoomEntity;

  beforeEach(() => {
    usersService = {
      findMentionCandidates: jest.fn(),
      toSafeDtoWithPermissions: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    permissionsFacade = {
      findRolesByIds: jest.fn(),
    } as unknown as jest.Mocked<PermissionsFacade>;

    roomsFacade = {
      canAccessRoom: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<RoomsFacade>;

    messageMentionRepository = {} as unknown as jest.Mocked<
      EntityRepository<MessageMentionEntity>
    >;

    service = new MentionsService(
      usersService,
      permissionsFacade,
      roomsFacade,
      messageMentionRepository,
    );
  });

  describe('resolve', () => {
    it('resolves valid user mentions and excludes author and non-accessible users', async () => {
      const author = createAuthor(1);
      const user2 = createUser(2);
      const user3 = createUser(3);

      usersService.findMentionCandidates.mockResolvedValue([user2, user3]);
      usersService.toSafeDtoWithPermissions.mockImplementation(async (u) =>
        createAuthor(u.id),
      );

      // User 3 cannot access the room
      roomsFacade.canAccessRoom.mockImplementation((user) => user.id === 2);

      const html = '<p>Hello &lt;@2&gt; and &lt;@3&gt; and &lt;@1&gt;!</p>';
      const result = await service.resolve(author, dummyRoom, html);

      expect(result.effective).toEqual({
        userIds: [2],
        roleIds: [],
        everyone: false,
      });
      expect(result.recipientIds).toEqual([2]);
    });

    it('excludes deleted users and self-mentions', async () => {
      const author = createAuthor(1);
      const user1 = createUser(1); // self
      const user2 = createUser(2, new Date()); // deleted

      usersService.findMentionCandidates.mockResolvedValue([user1, user2]);
      usersService.toSafeDtoWithPermissions.mockImplementation(async (u) =>
        createAuthor(u.id),
      );

      const html = '<p>&lt;@1&gt; &lt;@2&gt;</p>';
      const result = await service.resolve(author, dummyRoom, html);

      expect(result.effective.userIds).toEqual([]);
      expect(result.recipientIds).toEqual([]);
    });

    it('ignores @everyone and roles if author lacks MENTION_EVERYONE', async () => {
      const author = createAuthor(1, false, [EPermission.SEND_MESSAGES]);

      const html = '<p>@everyone and &lt;@&amp;5&gt;</p>';
      const result = await service.resolve(author, dummyRoom, html);

      expect(result.effective).toEqual({
        userIds: [],
        roleIds: [],
        everyone: false,
      });
      expect(result.recipientIds).toEqual([]);
      expect(permissionsFacade.findRolesByIds).not.toHaveBeenCalled();
      expect(usersService.findMentionCandidates).not.toHaveBeenCalled();
    });

    it('ignores mention tokens inside pre and code tags', async () => {
      const author = createAuthor(1, false, [EPermission.MENTION_EVERYONE]);
      const html =
        '<p>Check <code>@everyone</code> and <pre><code>&lt;@2&gt;</code></pre></p>';
      const result = await service.resolve(author, dummyRoom, html);

      expect(result.effective).toEqual({
        userIds: [],
        roleIds: [],
        everyone: false,
      });
      expect(result.recipientIds).toEqual([]);
      expect(usersService.findMentionCandidates).not.toHaveBeenCalled();
    });

    it('resolves @everyone when author has MENTION_EVERYONE, author excluded', async () => {
      const author = createAuthor(1, false, [EPermission.MENTION_EVERYONE]);
      const user2 = createUser(2);
      const user3 = createUser(3);

      usersService.findMentionCandidates.mockResolvedValue([
        createUser(1),
        user2,
        user3,
      ]);
      usersService.toSafeDtoWithPermissions.mockImplementation(async (u) =>
        createAuthor(u.id),
      );

      const html = '<p>Hey @everyone!</p>';
      const result = await service.resolve(author, dummyRoom, html);

      expect(result.effective.everyone).toBe(true);
      expect(result.recipientIds).toEqual([2, 3]);
      expect(usersService.findMentionCandidates).toHaveBeenCalledWith({
        everyone: true,
        userIds: [],
        roleIds: [],
      });
    });

    it('resolves @everyone in the second paragraph for an author with MENTION_EVERYONE', async () => {
      const author = createAuthor(1, false, [EPermission.MENTION_EVERYONE]);
      const user2 = createUser(2);
      const user3 = createUser(3);

      usersService.findMentionCandidates.mockResolvedValue([
        createUser(1),
        user2,
        user3,
      ]);
      usersService.toSafeDtoWithPermissions.mockImplementation(async (u) =>
        createAuthor(u.id),
      );

      const html = '<p>hello</p><p>@everyone</p>';
      const result = await service.resolve(author, dummyRoom, html);

      expect(result.effective.everyone).toBe(true);
      expect(result.recipientIds).toEqual([2, 3]);
    });

    it('resolves mentionable role when author has MENTION_EVERYONE and ignores non-mentionable role', async () => {
      const author = createAuthor(1, false, [EPermission.MENTION_EVERYONE]);
      const role1 = createRole(10, true, 'Devs');
      const role2 = createRole(20, false, 'Admins');

      permissionsFacade.findRolesByIds.mockResolvedValue([role1, role2]);

      const user2 = createUser(2);
      usersService.findMentionCandidates.mockResolvedValue([user2]);
      usersService.toSafeDtoWithPermissions.mockImplementation(async (u) =>
        createAuthor(u.id),
      );

      const html = '<p>&lt;@&amp;10&gt; and &lt;@&amp;20&gt;</p>';
      const result = await service.resolve(author, dummyRoom, html);

      expect(result.effective.roleIds).toEqual([10]);
      expect(result.recipientIds).toEqual([2]);
      expect(usersService.findMentionCandidates).toHaveBeenCalledWith({
        everyone: false,
        userIds: [],
        roleIds: [10],
      });
    });

    it('owner bypasses MENTION_EVERYONE permission', async () => {
      const owner = createAuthor(1, true, []);
      const role1 = createRole(5, true);

      permissionsFacade.findRolesByIds.mockResolvedValue([role1]);
      usersService.findMentionCandidates.mockResolvedValue([createUser(2)]);
      usersService.toSafeDtoWithPermissions.mockImplementation(async (u) =>
        createAuthor(u.id),
      );

      const html = '<p>@everyone and &lt;@&amp;5&gt;</p>';
      const result = await service.resolve(owner, dummyRoom, html);

      expect(result.effective.everyone).toBe(true);
      expect(result.effective.roleIds).toEqual([5]);
    });
  });

  describe('replace', () => {
    it('deletes removed rows, adds new rows, and returns added ids', async () => {
      const messageId = new Uint8Array([1, 2, 3]);
      const existingRow1 = {
        id: 1,
        message: { id: messageId },
        user: { id: 10 },
      } as MessageMentionEntity;
      const existingRow2 = {
        id: 2,
        message: { id: messageId },
        user: { id: 20 },
      } as MessageMentionEntity;

      const em = {
        find: jest.fn().mockResolvedValue([existingRow1, existingRow2]),
        remove: jest.fn(),
        create: jest.fn((_, data) => data),
        persist: jest.fn(),
        getReference: jest.fn((_, id) => ({ id })),
        flush: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<EntityManager>;

      // Existing: [10, 20]. New: [20, 30] -> toDelete: [10], added: [30]
      const addedIds = await service.replace(em, messageId, [20, 30]);

      expect(addedIds).toEqual([30]);
      expect(em.remove).toHaveBeenCalledWith(existingRow1);
      expect(em.remove).not.toHaveBeenCalledWith(existingRow2);
      expect(em.persist).toHaveBeenCalledTimes(1);
      expect(em.flush).toHaveBeenCalled();
    });
  });

  describe('renderPlainPreview', () => {
    it('formats plain preview with known and unknown users and roles', () => {
      const text =
        'Hi <@1> and <@2>! Check with <@&10> and <@&20>, plus @everyone.';
      const users = { 1: { username: 'alice' } };
      const roles = { 10: { name: 'devs' } };

      const preview = service.renderPlainPreview(text, users, roles);
      expect(preview).toBe(
        'Hi @alice and @unknown! Check with @devs and @unknown, plus @everyone.',
      );
    });
  });
});
