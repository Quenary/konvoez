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
import { parse, v7 } from 'uuid';
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  EAttachmentKind,
  ESettingKey,
  attachmentFileNameMaxLength,
} from '@konvoez/shared';
import { MESSAGE_ATTACHMENTS_BUCKET } from '@shared/services/file.service';
import { AttachmentsService } from './attachments.service';
import { sanitizeAttachmentName } from './attachments.http';
import { EAttachmentStatus } from './attachments.const';
import { MessageAttachmentEntity } from './attachments.entity';
import { GetUserDto } from '../users/users.dto';
import { EUserRole } from '@konvoez/shared';

describe('sanitizeAttachmentName', () => {
  it('keeps a Cyrillic name', () => {
    expect(sanitizeAttachmentName('folder/Отчёт.pdf')).toBe('Отчёт.pdf');
  });

  it('truncates a long name and keeps the extension', () => {
    const stem = 'а'.repeat(attachmentFileNameMaxLength);
    expect(sanitizeAttachmentName(`${stem}.pdf`)).toMatch(/\.pdf$/);
    expect(sanitizeAttachmentName(`${stem}.pdf`).length).toBeLessThanOrEqual(
      attachmentFileNameMaxLength,
    );
  });

  it('falls back when the name is empty', () => {
    expect(sanitizeAttachmentName('///')).toBe('file');
  });
});

describe('AttachmentsService', () => {
  const author: GetUserDto = {
    id: 1,
    username: 'author',
    fullname: 'Author',
    email: 'author@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };
  const outsider: GetUserDto = { ...author, id: 2, username: 'other' };

  let repo: {
    getEntityManager: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
  };
  let em: {
    persist: jest.Mock;
    flush: jest.Mock;
    remove: jest.Mock;
    nativeDelete: jest.Mock;
  };
  let fileService: { putFile: jest.Mock; delete: jest.Mock };
  let mimeSnifferService: { sniff: jest.Mock };
  let imageProcessingService: {
    readImageMetadata: jest.Mock;
    stripMetadata: jest.Mock;
    writeThumbnail: jest.Mock;
    reencodeClientPoster: jest.Mock;
  };
  let videoProcessingService: { createPoster: jest.Mock };
  let settingsService: { getValue: jest.Mock };
  let service: AttachmentsService;
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-att-'));
    filePath = path.join(dir, 'upload');
    fs.writeFileSync(filePath, Buffer.from('jpeg-bytes'));
    em = {
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn(),
      nativeDelete: jest.fn().mockResolvedValue(1),
    };
    repo = {
      getEntityManager: jest.fn().mockReturnValue(em),
      create: jest.fn().mockImplementation((data) => data),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };
    fileService = {
      putFile: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mimeSnifferService = { sniff: jest.fn().mockResolvedValue(null) };
    imageProcessingService = {
      readImageMetadata: jest.fn(),
      stripMetadata: jest.fn().mockResolvedValue(4),
      writeThumbnail: jest
        .fn()
        .mockImplementation(async (_src: string, dest: string) => {
          fs.writeFileSync(dest, 'thumb');
        }),
      reencodeClientPoster: jest.fn(),
    };
    videoProcessingService = {
      createPoster: jest.fn().mockResolvedValue({
        width: null,
        height: null,
        written: false,
        undecodable: false,
        durationMs: null,
        outcome: 'timeout',
      }),
    };
    settingsService = {
      getValue: jest.fn().mockResolvedValue(false),
    };
    service = new AttachmentsService(
      repo as never,
      fileService as never,
      mimeSnifferService as never,
      imageProcessingService as never,
      videoProcessingService as never,
      settingsService as never,
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function createPending(
    originalname = 'note.txt',
    size = fs.statSync(filePath).size,
    extras?: { poster?: { path?: string; size: number }; body?: unknown },
  ) {
    return service.createPending(
      author,
      {
        path: filePath,
        size,
        originalname,
      },
      extras,
    );
  }

  it('maps a jpeg to IMAGE and stores the original bytes when stripping is off', async () => {
    mimeSnifferService.sniff.mockResolvedValue('image/jpeg');
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 20,
      height: 10,
      pages: 1,
      format: 'jpeg',
    });

    const dto = await createPending('photo.jpg');

    expect(dto.kind).toBe(EAttachmentKind.IMAGE);
    expect(dto.mime).toBe('image/jpeg');
    expect(dto.width).toBe(20);
    expect(dto.thumbnailUrl).toBeNull();
    expect(imageProcessingService.stripMetadata).not.toHaveBeenCalled();
    expect(fileService.putFile).toHaveBeenCalledWith(
      expect.stringMatching(/^message-attachments\//),
      expect.objectContaining({
        path: filePath,
        size: fs.statSync(filePath).size,
        contentType: 'image/jpeg',
      }),
      MESSAGE_ATTACHMENTS_BUCKET,
    );
  });

  it('strips metadata only when the setting is on', async () => {
    mimeSnifferService.sniff.mockResolvedValue('image/jpeg');
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 20,
      height: 10,
      pages: 1,
      format: 'jpeg',
    });
    settingsService.getValue.mockImplementation(async (key: ESettingKey) =>
      key === ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA ? true : false,
    );
    fs.writeFileSync(`${filePath}.clean`, 'x');
    imageProcessingService.stripMetadata.mockImplementation(async () => {
      fs.writeFileSync(filePath, 'no-exif');
      return 7;
    });

    await createPending('photo.jpg');

    expect(imageProcessingService.stripMetadata).toHaveBeenCalledWith(filePath);
    expect(fileService.putFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ size: Buffer.byteLength('no-exif') }),
      MESSAGE_ATTACHMENTS_BUCKET,
    );
  });

  it('does not strip animated images', async () => {
    mimeSnifferService.sniff.mockResolvedValue('image/gif');
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 8,
      height: 8,
      pages: 3,
      format: 'gif',
    });
    settingsService.getValue.mockResolvedValue(true);

    await createPending('anim.gif', 10);

    expect(imageProcessingService.stripMetadata).not.toHaveBeenCalled();
    expect(imageProcessingService.writeThumbnail).toHaveBeenCalled();
  });

  it('maps an unreadable image, svg, html and heic to FILE', async () => {
    mimeSnifferService.sniff.mockResolvedValue('image/png');
    imageProcessingService.readImageMetadata.mockResolvedValue(null);
    expect((await createPending('broken.png')).kind).toBe(EAttachmentKind.FILE);

    mimeSnifferService.sniff.mockResolvedValue('image/heic');
    expect((await createPending('shot.heic')).kind).toBe(EAttachmentKind.FILE);

    mimeSnifferService.sniff.mockResolvedValue(null);
    expect((await createPending('page.html')).kind).toBe(EAttachmentKind.FILE);
    expect((await createPending('page.html')).mime).toBe(
      'application/octet-stream',
    );
  });

  it('maps mp4 and mov to VIDEO', async () => {
    mimeSnifferService.sniff.mockResolvedValue('video/mp4');
    expect((await createPending('clip.mp4')).kind).toBe(EAttachmentKind.VIDEO);

    mimeSnifferService.sniff.mockResolvedValue('video/quicktime');
    expect((await createPending('clip.mov')).kind).toBe(EAttachmentKind.VIDEO);
  });

  it('stores a video poster and the display size', async () => {
    mimeSnifferService.sniff.mockResolvedValue('video/mp4');
    videoProcessingService.createPoster.mockImplementation(
      async (_source: string, dest: string) => {
        fs.writeFileSync(dest, 'poster');
        return {
          width: 1920,
          height: 1080,
          written: true,
          undecodable: false,
          durationMs: 2000,
          outcome: 'frame',
        };
      },
    );

    const posterPath = path.join(dir, 'client-poster');
    fs.writeFileSync(posterPath, 'client');
    const dto = await createPending('clip.mp4', fs.statSync(filePath).size, {
      poster: { path: posterPath, size: 6 },
    });

    expect(dto.kind).toBe(EAttachmentKind.VIDEO);
    expect(dto.width).toBe(1920);
    expect(dto.height).toBe(1080);
    expect(dto.durationMs).toBe(2000);
    expect(dto.thumbnailUrl).toMatch(/\/thumbnail$/);
    expect(imageProcessingService.reencodeClientPoster).not.toHaveBeenCalled();
    expect(fileService.putFile).toHaveBeenCalledWith(
      expect.stringMatching(/-thumb$/),
      expect.objectContaining({ contentType: 'image/webp' }),
      MESSAGE_ATTACHMENTS_BUCKET,
    );
  });

  it('keeps the client duration when ffmpeg writes a frame without one', async () => {
    mimeSnifferService.sniff.mockResolvedValue('video/mp4');
    videoProcessingService.createPoster.mockImplementation(
      async (_source: string, dest: string) => {
        fs.writeFileSync(dest, 'poster');
        return {
          width: 640,
          height: 360,
          written: true,
          undecodable: false,
          durationMs: null,
          outcome: 'frame' as const,
        };
      },
    );

    const dto = await createPending('clip.mp4', fs.statSync(filePath).size, {
      body: { videoDuration: '12.5' },
    });

    expect(dto.kind).toBe(EAttachmentKind.VIDEO);
    expect(dto.durationMs).toBe(12500);
    expect(dto.thumbnailUrl).toMatch(/\/thumbnail$/);
  });

  it('keeps a video when the poster cannot be built', async () => {
    mimeSnifferService.sniff.mockResolvedValue('video/webm');
    videoProcessingService.createPoster.mockResolvedValue({
      width: null,
      height: null,
      written: false,
      undecodable: false,
      durationMs: null,
      outcome: 'timeout',
    });

    const dto = await createPending('clip.webm', fs.statSync(filePath).size, {
      body: { videoWidth: '640', videoHeight: '360', videoDuration: '12.5' },
    });

    expect(dto.kind).toBe(EAttachmentKind.VIDEO);
    expect(dto.thumbnailUrl).toBeNull();
    expect(dto.width).toBe(640);
    expect(dto.height).toBe(360);
    expect(dto.durationMs).toBe(12500);
    expect(fileService.putFile).toHaveBeenCalledTimes(1);
  });

  it('stores an undecodable video as a file', async () => {
    mimeSnifferService.sniff.mockResolvedValue('video/mp4');
    videoProcessingService.createPoster.mockResolvedValue({
      width: null,
      height: null,
      written: false,
      undecodable: true,
      durationMs: null,
      outcome: 'undecodable',
    });

    const dto = await createPending('clip.mp4');

    expect(dto.kind).toBe(EAttachmentKind.FILE);
    expect(dto.mime).toBe('video/mp4');
    expect(dto.width).toBeNull();
    expect(dto.height).toBeNull();
    expect(dto.thumbnailUrl).toBeNull();
    expect(dto.durationMs).toBeNull();
  });

  it('keeps an undecodable video when the client poster is valid', async () => {
    const posterPath = path.join(dir, 'poster');
    fs.writeFileSync(posterPath, 'jpeg');
    mimeSnifferService.sniff.mockImplementation(async (target: string) =>
      target === posterPath ? 'image/jpeg' : 'video/mp4',
    );
    videoProcessingService.createPoster.mockResolvedValue({
      width: null,
      height: null,
      written: false,
      undecodable: true,
      durationMs: null,
      outcome: 'undecodable',
    });
    imageProcessingService.reencodeClientPoster.mockImplementation(
      async (_src: string, dest: string) => {
        fs.writeFileSync(dest, 'webp');
        return { width: 320, height: 180 };
      },
    );

    const dto = await createPending('clip.mp4', fs.statSync(filePath).size, {
      poster: { path: posterPath, size: 4 },
      body: { videoDuration: '3' },
    });

    expect(dto.kind).toBe(EAttachmentKind.VIDEO);
    expect(dto.width).toBe(320);
    expect(dto.height).toBe(180);
    expect(dto.durationMs).toBe(3000);
    expect(dto.thumbnailUrl).toMatch(/\/thumbnail$/);
  });

  it('drops a bad client poster and fits hint dimensions', async () => {
    const posterPath = path.join(dir, 'poster');
    fs.writeFileSync(posterPath, 'nope');
    mimeSnifferService.sniff.mockImplementation(async (target: string) =>
      target === posterPath ? 'image/gif' : 'video/mp4',
    );
    videoProcessingService.createPoster.mockResolvedValue({
      width: null,
      height: null,
      written: false,
      undecodable: false,
      durationMs: null,
      outcome: 'missing',
    });

    const dto = await createPending('clip.mp4', fs.statSync(filePath).size, {
      poster: { path: posterPath, size: 4 },
      body: { videoWidth: '2000', videoHeight: '1000', videoDuration: 'nope' },
    });

    expect(imageProcessingService.reencodeClientPoster).not.toHaveBeenCalled();
    expect(dto.kind).toBe(EAttachmentKind.VIDEO);
    expect(dto.width).toBe(1024);
    expect(dto.height).toBe(512);
    expect(dto.durationMs).toBeNull();
    expect(dto.thumbnailUrl).toBeNull();
    expect(fs.existsSync(posterPath)).toBe(false);
  });

  it('ignores a poster attached to a non-video', async () => {
    const posterPath = path.join(dir, 'poster');
    fs.writeFileSync(posterPath, 'jpeg');
    mimeSnifferService.sniff.mockResolvedValue('image/jpeg');
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 20,
      height: 10,
      pages: 1,
      format: 'jpeg',
    });

    const dto = await createPending('photo.jpg', fs.statSync(filePath).size, {
      poster: { path: posterPath, size: 4 },
    });

    expect(dto.kind).toBe(EAttachmentKind.IMAGE);
    expect(imageProcessingService.reencodeClientPoster).not.toHaveBeenCalled();
    expect(videoProcessingService.createPoster).not.toHaveBeenCalled();
    expect(fs.existsSync(posterPath)).toBe(false);
  });

  it('stores a sanitised original name', async () => {
    await createPending('Отчёт.pdf');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: 'Отчёт.pdf' }),
    );
  });

  it('maps ENOSPC to 507', async () => {
    fileService.putFile.mockRejectedValue(
      Object.assign(new Error('full'), { code: 'ENOSPC' }),
    );

    await expect(createPending()).rejects.toMatchObject({
      message: 'STORAGE_FULL',
      status: 507,
    });
    await expect(createPending()).rejects.toBeInstanceOf(HttpException);
  });

  it('stores an image when metadata stripping fails', async () => {
    mimeSnifferService.sniff.mockResolvedValue('image/jpeg');
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 20,
      height: 10,
      pages: 1,
      format: 'jpeg',
    });
    settingsService.getValue.mockImplementation(async (key: ESettingKey) =>
      key === ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA ? true : false,
    );
    imageProcessingService.stripMetadata.mockRejectedValue(
      new Error('premature end of JPEG image'),
    );

    const dto = await createPending('photo.jpg');

    expect(dto.kind).toBe(EAttachmentKind.IMAGE);
    expect(dto.mime).toBe('image/jpeg');
    expect(fileService.putFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        path: filePath,
        contentType: 'image/jpeg',
      }),
      MESSAGE_ATTACHMENTS_BUCKET,
    );
  });

  it('degrades to FILE when the thumbnail cannot be built', async () => {
    mimeSnifferService.sniff.mockResolvedValue('image/jpeg');
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 4000,
      height: 3000,
      pages: 1,
      format: 'jpeg',
    });
    imageProcessingService.writeThumbnail.mockRejectedValue(
      new Error('premature end of JPEG image'),
    );

    const dto = await createPending('trunc.jpg');

    expect(dto.kind).toBe(EAttachmentKind.FILE);
    expect(dto.mime).toBe('application/octet-stream');
    expect(dto.thumbnailUrl).toBeNull();
    expect(dto.width).toBeNull();
    expect(fileService.putFile).toHaveBeenCalledTimes(1);
  });

  it('removes a derived thumbnail when storing the original fails', async () => {
    mimeSnifferService.sniff.mockResolvedValue('image/jpeg');
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 4000,
      height: 3000,
      pages: 1,
      format: 'jpeg',
    });
    fileService.putFile.mockRejectedValue(new Error('storage down'));

    await expect(createPending('big.jpg')).rejects.toThrow('storage down');
    expect(fs.existsSync(`${filePath}.thumb`)).toBe(false);
  });

  it('does not hold image-processing slots during storage writes', async () => {
    let sniffCalls = 0;
    mimeSnifferService.sniff.mockImplementation(async () => {
      sniffCalls += 1;
      return sniffCalls <= 2 ? 'image/jpeg' : null;
    });
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 20,
      height: 10,
      pages: 1,
      format: 'jpeg',
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let resolveAtTwo: () => void = () => undefined;
    const atTwo = new Promise<void>((resolve) => {
      resolveAtTwo = resolve;
    });
    let resolveAtThree: () => void = () => undefined;
    const atThree = new Promise<void>((resolve) => {
      resolveAtThree = resolve;
    });
    fileService.putFile.mockImplementation(() => {
      const calls = fileService.putFile.mock.calls.length;
      if (calls === 2) {
        resolveAtTwo();
      }
      if (calls === 3) {
        resolveAtThree();
      }
      return gate;
    });

    const first = createPending('a.jpg');
    const second = createPending('b.jpg');
    await atTwo;
    expect(fileService.putFile).toHaveBeenCalledTimes(2);

    const third = createPending('note.txt');
    await atThree;
    expect(fileService.putFile).toHaveBeenCalledTimes(3);

    release();
    await Promise.all([first, second, third]);
  });

  it('does not hold an image-processing slot while a video poster is built', async () => {
    let releasePoster: () => void = () => undefined;
    const posterGate = new Promise<void>((resolve) => {
      releasePoster = resolve;
    });
    videoProcessingService.createPoster.mockReturnValue(
      posterGate.then(() => ({
        width: 8,
        height: 8,
        written: false,
        undecodable: false,
      })),
    );
    let sniffCalls = 0;
    mimeSnifferService.sniff.mockImplementation(async () => {
      sniffCalls += 1;
      return sniffCalls === 1 ? 'video/mp4' : 'image/jpeg';
    });
    imageProcessingService.readImageMetadata.mockResolvedValue({
      width: 20,
      height: 10,
      pages: 1,
      format: 'jpeg',
    });

    let resolveAtTwo: () => void = () => undefined;
    const atTwo = new Promise<void>((resolve) => {
      resolveAtTwo = resolve;
    });
    fileService.putFile.mockImplementation(() => {
      if (fileService.putFile.mock.calls.length === 2) {
        resolveAtTwo();
      }
      return undefined;
    });

    const video = createPending('clip.mp4');
    const first = createPending('a.jpg');
    const second = createPending('b.jpg');
    await atTwo;
    expect(fileService.putFile).toHaveBeenCalledTimes(2);

    releasePoster();
    await Promise.all([video, first, second]);
  });

  it('deletes stored objects when the database write fails', async () => {
    em.flush.mockRejectedValue(new Error('db down'));

    await expect(createPending()).rejects.toThrow('db down');
    expect(fileService.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^message-attachments\//),
    );
  });

  describe('access and delete', () => {
    function row(
      overrides: Record<string, unknown> = {},
    ): MessageAttachmentEntity {
      return {
        id: parse(v7()),
        status: EAttachmentStatus.PENDING,
        kind: EAttachmentKind.FILE,
        mime: 'application/octet-stream',
        size: 3,
        originalName: 'a.txt',
        storageKey: 'message-attachments/a',
        thumbnailKey: null,
        width: null,
        height: null,
        uploader: { id: author.id },
        message: null,
        ...overrides,
      } as unknown as MessageAttachmentEntity;
    }

    it('allows the uploader to read a pending file and hides it from others', async () => {
      const pending = row();
      repo.findOne.mockResolvedValue(pending);
      const id = '00000000-0000-7000-8000-000000000001';
      pending.id = parse(id);

      await expect(
        service.resolveReadable(id, author, false),
      ).resolves.toMatchObject({
        key: pending.storageKey,
      });
      await expect(
        service.resolveReadable(id, outsider, false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hides a detached attachment', async () => {
      const id = '00000000-0000-7000-8000-000000000002';
      repo.findOne.mockResolvedValue(
        row({
          id: parse(id),
          status: EAttachmentStatus.ATTACHED,
          message: null,
        }),
      );

      await expect(
        service.resolveReadable(id, author, false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows any user to read a room attachment', async () => {
      const id = '00000000-0000-7000-8000-000000000003';
      repo.findOne.mockResolvedValue(
        row({
          id: parse(id),
          status: EAttachmentStatus.ATTACHED,
          message: { room: { id: 4 }, sender: { id: 9 }, recipient: null },
        }),
      );

      await expect(
        service.resolveReadable(id, outsider, false),
      ).resolves.toMatchObject({ key: 'message-attachments/a' });
    });

    it('allows only DM participants to read a direct attachment', async () => {
      const id = '00000000-0000-7000-8000-000000000004';
      repo.findOne.mockResolvedValue(
        row({
          id: parse(id),
          status: EAttachmentStatus.ATTACHED,
          message: {
            room: null,
            sender: { id: 9 },
            recipient: { id: author.id },
          },
        }),
      );

      await expect(
        service.resolveReadable(id, author, false),
      ).resolves.toBeTruthy();
      await expect(
        service.resolveReadable(id, outsider, false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes a pending upload owned by the caller', async () => {
      const id = '00000000-0000-7000-8000-000000000005';
      const pending = row({ id: parse(id) });
      repo.findOne.mockResolvedValue(pending);

      await service.deletePending(id, author);

      expect(em.nativeDelete).toHaveBeenCalledWith(
        MessageAttachmentEntity,
        expect.objectContaining({
          uploader: author.id,
          status: EAttachmentStatus.PENDING,
          message: null,
        }),
      );
      expect(fileService.delete).toHaveBeenCalledWith(pending.storageKey);
      expect(em.remove).not.toHaveBeenCalled();
    });

    it('does not delete stored files when the row was claimed', async () => {
      const id = '00000000-0000-7000-8000-000000000006';
      repo.findOne.mockResolvedValue(row({ id: parse(id) }));
      em.nativeDelete.mockResolvedValue(0);

      await expect(service.deletePending(id, author)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(fileService.delete).not.toHaveBeenCalled();
    });

    it('returns 404 when deleting an attached or foreign upload', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.deletePending(v7(), outsider),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports missing claims', async () => {
      const nativeUpdate = jest.fn().mockResolvedValue(0);
      const id = v7();

      await expect(
        service.claimForMessage(
          { nativeUpdate } as never,
          author.id,
          parse(v7()),
          [id],
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
