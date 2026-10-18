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
    MikroORM: class MikroORM {},
    EntityManager: class EntityManager {},
  };
});
jest.mock('../rooms/rooms.facade', () => ({
  RoomsFacade: class {},
}));

import type { EntityManager, MikroORM } from '@mikro-orm/core';
import type {
  FileService,
  StoredFileInfo,
} from '@shared/services/file.service';
import { RoomsFacade } from '../rooms/rooms.facade';
import { UserEntity } from '../users/users.entity';
import { MessageAttachmentEntity } from '../attachments/attachments.entity';
import { OrphanFilesService } from './orphan-files.service';

describe('OrphanFilesService', () => {
  const now = Date.UTC(2026, 0, 15);
  const referencedUserKey = 'users-avatars/keep.webp';
  const referencedRoomKey = 'rooms-avatars/keep.webp';
  const orphanKey = 'users-avatars/old.webp';
  const freshKey = 'users-avatars/fresh.webp';

  let service: OrphanFilesService;
  let find: jest.Mock;
  let roomsFacade: { findAvatarKeys: jest.Mock };
  let fileService: jest.Mocked<Pick<FileService, 'list' | 'delete'>>;
  let oldFile: StoredFileInfo;
  let freshFile: StoredFileInfo;

  beforeEach(() => {
    find = jest.fn(async (entity: unknown) => {
      if (entity === UserEntity) {
        return [{ avatar: referencedUserKey }];
      }
      if (entity === MessageAttachmentEntity) {
        return [
          {
            storageKey: 'message-attachments/keep',
            thumbnailKey: 'message-attachments/keep-thumb',
          },
        ];
      }
      return [];
    });

    roomsFacade = {
      findAvatarKeys: jest.fn().mockResolvedValue([referencedRoomKey]),
    };

    const em = {
      fork: jest.fn(() => ({ find }) as unknown as EntityManager),
    };

    fileService = {
      list: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    service = new OrphanFilesService(
      { em } as unknown as MikroORM,
      fileService as unknown as FileService,
      roomsFacade as unknown as RoomsFacade,
    );

    const gracePeriodMs = service['orphanGracePeriodMs'];
    oldFile = { key: orphanKey, modifiedAt: new Date(now - gracePeriodMs) };
    freshFile = {
      key: freshKey,
      modifiedAt: new Date(now - gracePeriodMs + 1),
    };
    fileService.list.mockImplementation(async (bucket: string) => {
      if (bucket === 'users-avatars') {
        return [
          { key: referencedUserKey, modifiedAt: oldFile.modifiedAt },
          oldFile,
          freshFile,
        ];
      }
      return [{ key: referencedRoomKey, modifiedAt: oldFile.modifiedAt }];
    });
  });

  it('should delete unreferenced files older than the grace period', async () => {
    await expect(service.cleanup(now)).resolves.toBe(1);
    expect(fileService.delete).toHaveBeenCalledTimes(1);
    expect(fileService.delete).toHaveBeenCalledWith(orphanKey);
  });

  it('should keep cleaning other buckets when one list fails', async () => {
    const roomOrphan = 'rooms-avatars/old.webp';
    fileService.list.mockImplementation(async (bucket: string) => {
      if (bucket === 'users-avatars') {
        throw new Error('list failed');
      }
      if (bucket === 'rooms-avatars') {
        return [{ key: roomOrphan, modifiedAt: oldFile.modifiedAt }];
      }
      return [];
    });
    find.mockResolvedValue([]);
    roomsFacade.findAvatarKeys.mockResolvedValue([]);
    await expect(service.cleanup(now)).resolves.toBe(1);
    expect(fileService.delete).toHaveBeenCalledWith(roomOrphan);
  });

  it('should skip a concurrent cleanup', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fileService.list.mockImplementation(async () => {
      await gate;
      return [];
    });

    const first = service.cleanup(now);
    await expect(service.cleanup(now)).resolves.toBe(0);
    release();
    await expect(first).resolves.toBe(0);
    expect(fileService.delete).not.toHaveBeenCalled();
  });

  it('keeps referenced attachment and thumbnail keys', async () => {
    const orphan = 'message-attachments/orphan';
    fileService.list.mockImplementation(async (bucket: string) => {
      if (bucket !== 'message-attachments') {
        return [];
      }
      return [
        { key: 'message-attachments/keep', modifiedAt: oldFile.modifiedAt },
        {
          key: 'message-attachments/keep-thumb',
          modifiedAt: oldFile.modifiedAt,
        },
        { key: orphan, modifiedAt: oldFile.modifiedAt },
      ];
    });

    await expect(service.cleanup(now)).resolves.toBe(1);
    expect(fileService.delete).toHaveBeenCalledWith(orphan);
  });
});
