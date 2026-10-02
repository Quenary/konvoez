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
  };
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { attachmentsPendingTtlMs } from '@konvoez/shared';
import { AttachmentsCleanupService } from './attachments-cleanup.service';
import { EAttachmentStatus } from './attachments.const';

describe('AttachmentsCleanupService', () => {
  const em = {
    remove: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const repo = {
    getEntityManager: jest.fn().mockReturnValue(em),
    find: jest.fn().mockResolvedValue([]),
  };
  const fileService = {
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const appService = { UPLOAD_TMP_DIR: '' };
  let service: AttachmentsCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.find.mockResolvedValue([]);
    fileService.delete.mockResolvedValue(undefined);
    appService.UPLOAD_TMP_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'konvoez-tmp-'),
    );
    service = new AttachmentsCleanupService(
      repo as never,
      fileService as never,
      appService as never,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  function pendingRow(createdAt: Date) {
    return {
      status: EAttachmentStatus.PENDING,
      createdAt,
      storageKey: 'message-attachments/old',
      thumbnailKey: 'message-attachments/old-thumb',
      message: { id: 1 },
      uploader: { id: 1 },
    };
  }

  it('purges pending rows older than the ttl', async () => {
    const row = pendingRow(
      new Date(Date.now() - attachmentsPendingTtlMs - 1000),
    );
    repo.find.mockImplementation(async (where: { status?: string }) =>
      where.status === EAttachmentStatus.PENDING ? [row] : [],
    );

    await service.sweep();

    expect(fileService.delete).toHaveBeenCalledWith(row.storageKey);
    expect(em.remove).toHaveBeenCalledWith(row);
    expect(em.flush).toHaveBeenCalled();
  });

  it('purges detached rows and deletes objects before rows', async () => {
    const order: string[] = [];
    const row = {
      status: EAttachmentStatus.ATTACHED,
      storageKey: 'message-attachments/gone',
      thumbnailKey: null,
      message: null,
      uploader: { id: 1 },
    };
    repo.find.mockImplementation(async (where: { $or?: unknown }) =>
      where.$or ? [row] : [],
    );
    fileService.delete.mockImplementation(async () => {
      order.push('delete');
    });
    em.remove.mockImplementation(() => {
      order.push('remove');
    });
    em.flush.mockImplementation(async () => {
      order.push('flush');
    });

    await service.purgeDetached();

    expect(order).toEqual(['delete', 'remove', 'flush']);
  });

  it('ignores a missing stored object', async () => {
    const row = {
      status: EAttachmentStatus.PENDING,
      storageKey: 'message-attachments/missing',
      thumbnailKey: null,
      message: null,
      uploader: null,
    };
    repo.find.mockResolvedValue([row]);
    fileService.delete.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(service.purgeDetached()).resolves.toBeUndefined();
    expect(em.remove).toHaveBeenCalledWith(row);
  });

  it('does not overlap a running purge', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    repo.find.mockImplementation(async () => {
      await gate;
      return [];
    });

    const first = service.purgeDetached();
    await expect(service.purgeDetached()).resolves.toBeUndefined();
    release();
    await first;
    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it('starts a purge from delete events', async () => {
    const purge = jest
      .spyOn(service, 'purgeDetached')
      .mockResolvedValue(undefined);
    service.onDeleted();
    expect(purge).toHaveBeenCalled();
  });

  it('removes temp files older than an hour at boot', async () => {
    const oldPath = path.join(appService.UPLOAD_TMP_DIR, 'old');
    const freshPath = path.join(appService.UPLOAD_TMP_DIR, 'fresh');
    fs.writeFileSync(oldPath, 'old');
    fs.writeFileSync(freshPath, 'fresh');
    const hour = 60 * 60 * 1000;
    const past = new Date(Date.now() - hour - 1000);
    fs.utimesSync(oldPath, past, past);

    await service.sweepTempDir();

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(freshPath)).toBe(true);
  });
});
