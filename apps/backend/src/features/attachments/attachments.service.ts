import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Semaphore } from 'async-mutex';
import fs from 'fs';
import { parse, stringify as uuidStringify, v7 } from 'uuid';
import {
  attachmentsMaxPendingPerUser,
  attachmentsThumbnailMaxSide,
  EAttachmentKind,
  ESettingKey,
  IAttachment,
  INLINE_AUDIO_MIMES,
  INLINE_IMAGE_MIMES,
  INLINE_VIDEO_MIMES,
} from '@konvoez/shared';
import {
  type FileService,
  FileServiceInjectionToken,
  MESSAGE_ATTACHMENTS_BUCKET,
} from '@shared/services/file.service';
import { ImageProcessingService } from '@shared/services/image-processing.service';
import { SettingsService } from '../settings/settings.service';
import { GetUserDto } from '../users/users.dto';
import { EAttachmentStatus, isEnospc } from './attachments.const';
import { MessageAttachmentEntity } from './attachments.entity';
import { sanitizeAttachmentName } from './attachments.http';
import { MimeSnifferService } from './mime-sniffer.service';

const processingSemaphore = new Semaphore(2);
const STRIPPABLE_FORMATS = new Set(['jpeg', 'webp', 'avif', 'png']);

interface IStoredUpload {
  mime: string;
  kind: EAttachmentKind;
  width: number | null;
  height: number | null;
  thumbnailPath: string | null;
  size: number;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(MessageAttachmentEntity)
    private readonly repo: EntityRepository<MessageAttachmentEntity>,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
    private readonly mimeSnifferService: MimeSnifferService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly settingsService: SettingsService,
  ) {
    this.em = this.repo.getEntityManager();
  }

  public async createPending(
    author: GetUserDto,
    file: { path?: string; size: number; originalname?: string } | undefined,
  ): Promise<IAttachment> {
    if (!file?.path) {
      throw new HttpException('FILE_REQUIRED', HttpStatus.BAD_REQUEST);
    }
    const storedFile = {
      path: file.path,
      size: file.size,
      originalname: file.originalname,
    };
    try {
      return await this.storePending(author, storedFile);
    } catch (error) {
      if (isEnospc(error)) {
        throw new HttpException('STORAGE_FULL', 507);
      }
      throw error;
    }
  }

  public toDto(entity: MessageAttachmentEntity): IAttachment {
    const id = uuidStringify(entity.id);
    return {
      id,
      kind: entity.kind as EAttachmentKind,
      name: entity.originalName,
      mime: entity.mime,
      size: entity.size,
      width: entity.width ?? null,
      height: entity.height ?? null,
      url: `/api/v1/attachments/${id}/content`,
      thumbnailUrl: entity.thumbnailKey
        ? `/api/v1/attachments/${id}/thumbnail`
        : null,
    };
  }

  public async findAttachedByMessageIds(
    ids: readonly Uint8Array[],
  ): Promise<Map<string, IAttachment[]>> {
    const result = new Map<string, IAttachment[]>();
    if (ids.length === 0) {
      return result;
    }
    const rows = await this.repo.find(
      { message: { $in: [...ids] }, status: EAttachmentStatus.ATTACHED },
      { orderBy: { position: 'ASC' } },
    );
    for (const row of rows) {
      const message = row.message;
      if (!message) {
        continue;
      }
      const key = uuidStringify(message.id);
      const list = result.get(key) ?? [];
      list.push(this.toDto(row));
      result.set(key, list);
    }
    return result;
  }

  public async deletePending(id: string, author: GetUserDto): Promise<void> {
    const row = await this.repo.findOne({
      id: parse(id),
      uploader: author.id,
      status: EAttachmentStatus.PENDING,
      message: null,
    });
    if (!row) {
      throw new NotFoundException();
    }
    const storageKey = row.storageKey;
    const thumbnailKey = row.thumbnailKey;
    const deleted = await this.em.nativeDelete(MessageAttachmentEntity, {
      id: parse(id),
      uploader: author.id,
      status: EAttachmentStatus.PENDING,
      message: null,
    });
    if (deleted !== 1) {
      throw new NotFoundException();
    }
    await this.removeStored(storageKey, thumbnailKey ?? null);
  }

  public async resolveReadable(
    id: string,
    author: GetUserDto,
    thumbnail: boolean,
  ): Promise<{
    entity: MessageAttachmentEntity;
    key: string;
    mime: string;
    downloadName: string;
  }> {
    const entity = await this.repo.findOne(
      { id: parse(id) },
      {
        populate: [
          'message',
          'message.sender',
          'message.recipient',
          'uploader',
        ],
      },
    );
    if (!entity || !this.canRead(entity, author)) {
      throw new NotFoundException();
    }
    if (thumbnail) {
      if (entity.thumbnailKey) {
        return {
          entity,
          key: entity.thumbnailKey,
          mime: 'image/webp',
          downloadName: entity.originalName,
        };
      }
      if (entity.kind === EAttachmentKind.IMAGE) {
        return {
          entity,
          key: entity.storageKey,
          mime: entity.mime,
          downloadName: entity.originalName,
        };
      }
      throw new NotFoundException();
    }
    return {
      entity,
      key: entity.storageKey,
      mime: entity.mime,
      downloadName: entity.originalName,
    };
  }

  public canReadMessage(
    message: {
      room?: unknown;
      sender: { id: number };
      recipient?: { id: number } | null;
    },
    user: GetUserDto,
  ): boolean {
    if (message.room) {
      return true;
    }
    return message.sender.id === user.id || message.recipient?.id === user.id;
  }

  public async claimForMessage(
    em: EntityManager,
    authorId: number,
    messageId: Uint8Array,
    attachmentIds: readonly string[],
  ): Promise<void> {
    const missing: string[] = [];
    for (const [index, id] of attachmentIds.entries()) {
      const updated = await em.nativeUpdate(
        MessageAttachmentEntity,
        {
          id: parse(id),
          uploader: authorId,
          status: EAttachmentStatus.PENDING,
          message: null,
        },
        {
          status: EAttachmentStatus.ATTACHED,
          message: messageId,
          position: index,
        },
      );
      if (updated !== 1) {
        missing.push(id);
      }
    }
    if (missing.length > 0) {
      throw new ConflictException({
        message: 'ATTACHMENTS_UNAVAILABLE',
        attachmentIds: missing,
      });
    }
  }

  private canRead(
    entity: MessageAttachmentEntity,
    author: GetUserDto,
  ): boolean {
    if (entity.status === EAttachmentStatus.PENDING) {
      return entity.uploader?.id === author.id;
    }
    if (!entity.message) {
      return false;
    }
    return this.canReadMessage(entity.message, author);
  }

  private async storePending(
    author: GetUserDto,
    file: { path: string; size: number; originalname?: string },
  ): Promise<IAttachment> {
    const sniffed = await this.mimeSnifferService.sniff(file.path);
    const classified = await this.classify(file, sniffed);
    const pending = await this.repo.count({
      uploader: author.id,
      status: EAttachmentStatus.PENDING,
    });
    if (pending >= attachmentsMaxPendingPerUser) {
      throw new HttpException('ATTACHMENTS_PENDING_LIMIT', 429);
    }

    const id = parse(v7());
    const idString = uuidStringify(id);
    const storageKey = `${MESSAGE_ATTACHMENTS_BUCKET}/${idString}`;
    const thumbnailKey = classified.thumbnailPath
      ? `${MESSAGE_ATTACHMENTS_BUCKET}/${idString}-thumb`
      : null;
    const stat = await fs.promises.stat(file.path);
    try {
      await this.fileService.putFile(
        storageKey,
        {
          path: file.path,
          size: stat.size,
          contentType: classified.mime,
        },
        MESSAGE_ATTACHMENTS_BUCKET,
      );
      if (classified.thumbnailPath && thumbnailKey) {
        const thumbStat = await fs.promises.stat(classified.thumbnailPath);
        await this.fileService.putFile(
          thumbnailKey,
          {
            path: classified.thumbnailPath,
            size: thumbStat.size,
            contentType: 'image/webp',
          },
          MESSAGE_ATTACHMENTS_BUCKET,
        );
      }
      const entity = this.repo.create({
        id,
        status: EAttachmentStatus.PENDING,
        uploader: author.id,
        kind: classified.kind,
        mime: classified.mime,
        size: stat.size,
        originalName: sanitizeAttachmentName(file.originalname || 'file'),
        storageKey,
        thumbnailKey,
        width: classified.width,
        height: classified.height,
        position: 0,
        message: null,
      });
      this.em.persist(entity);
      await this.em.flush();
      return this.toDto(entity);
    } catch (error) {
      await this.fileService.delete(storageKey).catch(() => undefined);
      if (thumbnailKey) {
        await this.fileService.delete(thumbnailKey).catch(() => undefined);
      }
      await fs.promises.rm(`${file.path}.thumb`, { force: true });
      await fs.promises.rm(`${file.path}.clean`, { force: true });
      throw error;
    }
  }

  private async classify(
    file: { path: string; size: number },
    sniffed: string | null,
  ): Promise<IStoredUpload> {
    if (
      sniffed &&
      (INLINE_IMAGE_MIMES as readonly string[]).includes(sniffed)
    ) {
      return processingSemaphore.runExclusive(() =>
        this.processImage(file, sniffed),
      );
    }
    if (
      sniffed &&
      (INLINE_VIDEO_MIMES as readonly string[]).includes(sniffed)
    ) {
      return {
        mime: sniffed,
        kind: EAttachmentKind.VIDEO,
        width: null,
        height: null,
        thumbnailPath: null,
        size: file.size,
      };
    }
    if (
      sniffed &&
      (INLINE_AUDIO_MIMES as readonly string[]).includes(sniffed)
    ) {
      return {
        mime: sniffed,
        kind: EAttachmentKind.AUDIO,
        width: null,
        height: null,
        thumbnailPath: null,
        size: file.size,
      };
    }
    return {
      mime: sniffed ?? 'application/octet-stream',
      kind: EAttachmentKind.FILE,
      width: null,
      height: null,
      thumbnailPath: null,
      size: file.size,
    };
  }

  private async processImage(
    file: { path: string; size: number },
    sniffed: string,
  ): Promise<IStoredUpload> {
    const metadata = await this.imageProcessingService.readImageMetadata(
      file.path,
    );
    if (!metadata) {
      return {
        mime: 'application/octet-stream',
        kind: EAttachmentKind.FILE,
        width: null,
        height: null,
        thumbnailPath: null,
        size: file.size,
      };
    }
    let size = file.size;
    const strip = await this.settingsService.getValue(
      ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA,
    );
    const animated = metadata.pages > 1;
    if (
      strip &&
      !animated &&
      metadata.format &&
      STRIPPABLE_FORMATS.has(metadata.format) &&
      metadata.format !== 'gif'
    ) {
      try {
        size = await this.imageProcessingService.stripMetadata(file.path);
      } catch (error) {
        this.logger.warn(
          `Image metadata strip failed, keeping original bytes: ${error instanceof Error ? error.message : error}`,
        );
        await fs.promises.rm(`${file.path}.thumb`, { force: true });
        await fs.promises.rm(`${file.path}.clean`, { force: true });
        size = file.size;
      }
    }
    const width = metadata.width;
    const height = metadata.height;
    const needsThumb =
      animated ||
      (width !== null && width > attachmentsThumbnailMaxSide) ||
      (height !== null && height > attachmentsThumbnailMaxSide) ||
      size > 512 * 1024;
    if (!needsThumb) {
      return {
        mime: sniffed,
        kind: EAttachmentKind.IMAGE,
        width,
        height,
        thumbnailPath: null,
        size,
      };
    }
    const thumbnailPath = `${file.path}.thumb`;
    try {
      await this.imageProcessingService.writeThumbnail(
        file.path,
        thumbnailPath,
        metadata.pages,
      );
    } catch (error) {
      this.logger.warn(
        `Thumbnail failed, storing the upload as a file: ${error instanceof Error ? error.message : error}`,
      );
      await fs.promises.rm(thumbnailPath, { force: true });
      await fs.promises.rm(`${file.path}.clean`, { force: true });
      return {
        mime: 'application/octet-stream',
        kind: EAttachmentKind.FILE,
        width: null,
        height: null,
        thumbnailPath: null,
        size: file.size,
      };
    }
    return {
      mime: sniffed,
      kind: EAttachmentKind.IMAGE,
      width,
      height,
      thumbnailPath,
      size,
    };
  }

  private async removeStored(
    storageKey: string,
    thumbnailKey: string | null,
  ): Promise<void> {
    await this.fileService.delete(storageKey).catch(() => undefined);
    if (thumbnailKey) {
      await this.fileService.delete(thumbnailKey).catch(() => undefined);
    }
  }
}
