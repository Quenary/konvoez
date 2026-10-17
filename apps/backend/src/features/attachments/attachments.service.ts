import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Semaphore } from 'async-mutex';
import fs from 'fs';
import { parse, stringify as uuidStringify, v7 } from 'uuid';
import {
  ApiErrorCode,
  attachmentUploadHintsSchema,
  attachmentsMaxPendingPerUser,
  attachmentsMaxPosterSize,
  attachmentsThumbnailMaxSide,
  EAttachmentKind,
  EPermission,
  ESettingKey,
  IAttachment,
  IAttachmentUploadHints,
  INLINE_AUDIO_MIMES,
  INLINE_IMAGE_MIMES,
  INLINE_VIDEO_MIMES,
} from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import {
  type FileService,
  FileServiceInjectionToken,
  MESSAGE_ATTACHMENTS_BUCKET,
} from '@shared/services/file.service';
import { ImageProcessingService } from '@shared/services/image-processing.service';
import { VideoProcessingService } from '@shared/services/video-processing.service';
import { isEnospc } from '@shared/utils/is-enospc';
import { SettingsService } from '../settings/settings.service';
import { RoomsService } from '../rooms/rooms.service';
import { RoomEntity } from '../rooms/rooms.entity';
import { GetUserDto } from '../users/users.dto';
import { EAttachmentStatus } from './attachments.const';
import { MessageAttachmentEntity } from './attachments.entity';
import { sanitizeAttachmentName } from './attachments.http';
import { MimeSnifferService } from './mime-sniffer.service';

const processingSemaphore = new Semaphore(2);
const STRIPPABLE_FORMATS = new Set(['jpeg', 'webp', 'avif', 'png']);

const CLIENT_POSTER_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

interface IUploadExtras {
  poster?: { path?: string; size: number };
  body?: unknown;
}

interface IStoredUpload {
  mime: string;
  kind: EAttachmentKind;
  width: number | null;
  height: number | null;
  durationMs: number | null;
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
    private readonly videoProcessingService: VideoProcessingService,
    private readonly settingsService: SettingsService,
    private readonly roomsService: RoomsService,
  ) {
    this.em = this.repo.getEntityManager();
  }

  public async createPending(
    author: GetUserDto,
    file: { path?: string; size: number; originalname?: string } | undefined,
    extras?: IUploadExtras,
  ): Promise<IAttachment> {
    if (
      !author.isOwner &&
      !author.permissions?.includes(EPermission.USE_ATTACHMENTS)
    ) {
      throw AppException.forbidden(
        ApiErrorCode.FORBIDDEN,
        'Permission denied to upload attachments',
      );
    }

    if (!file?.path) {
      throw AppException.badRequest(
        ApiErrorCode.FILE_REQUIRED,
        'File required',
      );
    }
    const storedFile = {
      path: file.path,
      size: file.size,
      originalname: file.originalname,
    };
    try {
      return await this.storePending(author, storedFile, extras);
    } catch (error) {
      if (isEnospc(error)) {
        throw new AppException(ApiErrorCode.STORAGE_FULL, 507);
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
      durationMs: entity.durationMs ?? null,
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
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        'Attachment not found',
      );
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
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        'Attachment not found',
      );
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
          'message.room',
          'message.room.allowedRoles',
          'message.room.allowedUsers',
          'message.sender',
          'message.recipient',
          'uploader',
        ],
      },
    );
    if (!entity || !this.canRead(entity, author)) {
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        'Attachment not found',
      );
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
      throw AppException.notFound(
        ApiErrorCode.FILE_NOT_FOUND,
        'Attachment not found',
      );
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
      return this.roomsService.canAccessRoom(user, message.room as RoomEntity);
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
      throw AppException.conflict(ApiErrorCode.ATTACHMENTS_UNAVAILABLE, {
        message: 'Attachments unavailable',
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
    extras?: IUploadExtras,
  ): Promise<IAttachment> {
    const sniffed = await this.mimeSnifferService.sniff(file.path);
    const hints = attachmentUploadHintsSchema.parse(extras?.body ?? {});
    const classified = await this.classify(
      file,
      sniffed,
      extras?.poster,
      hints,
    );
    const pending = await this.repo.count({
      uploader: author.id,
      status: EAttachmentStatus.PENDING,
    });
    if (pending >= attachmentsMaxPendingPerUser) {
      throw new AppException(ApiErrorCode.ATTACHMENTS_PENDING_LIMIT, 429);
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
        durationMs: classified.durationMs,
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
    poster: { path?: string; size: number } | undefined,
    hints: IAttachmentUploadHints,
  ): Promise<IStoredUpload> {
    const isVideo =
      !!sniffed && (INLINE_VIDEO_MIMES as readonly string[]).includes(sniffed);
    if (!isVideo) {
      await this.discardPoster(poster?.path);
    }
    if (
      sniffed &&
      (INLINE_IMAGE_MIMES as readonly string[]).includes(sniffed)
    ) {
      return processingSemaphore.runExclusive(() =>
        this.processImage(file, sniffed),
      );
    }
    if (isVideo && sniffed) {
      return this.processVideo(file, sniffed, poster, hints);
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
        durationMs: null,
        thumbnailPath: null,
        size: file.size,
      };
    }
    return {
      mime: sniffed ?? 'application/octet-stream',
      kind: EAttachmentKind.FILE,
      width: null,
      height: null,
      durationMs: null,
      thumbnailPath: null,
      size: file.size,
    };
  }

  private async processVideo(
    file: { path: string; size: number },
    sniffed: string,
    poster: { path?: string; size: number } | undefined,
    hints: IAttachmentUploadHints,
  ): Promise<IStoredUpload> {
    const thumbnailPath = `${file.path}.thumb`;
    const server = await this.videoProcessingService.createPoster(
      file.path,
      thumbnailPath,
      sniffed,
    );
    const clientDuration = clientDurationMs(hints.videoDuration);
    if (server.outcome === 'frame') {
      await this.discardPoster(poster?.path);
      return {
        mime: sniffed,
        kind: EAttachmentKind.VIDEO,
        width: server.width,
        height: server.height,
        durationMs: server.durationMs ?? clientDuration,
        thumbnailPath: server.written ? thumbnailPath : null,
        size: file.size,
      };
    }
    const client = await this.acceptClientPoster(poster, thumbnailPath);
    if (server.outcome === 'undecodable' && !client) {
      return {
        mime: sniffed,
        kind: EAttachmentKind.FILE,
        width: null,
        height: null,
        durationMs: null,
        thumbnailPath: null,
        size: file.size,
      };
    }
    if (client) {
      return {
        mime: sniffed,
        kind: EAttachmentKind.VIDEO,
        width: client.width,
        height: client.height,
        durationMs: clientDuration,
        thumbnailPath,
        size: file.size,
      };
    }
    const fitted = fitVideoHints(hints.videoWidth, hints.videoHeight);
    return {
      mime: sniffed,
      kind: EAttachmentKind.VIDEO,
      width: fitted?.width ?? null,
      height: fitted?.height ?? null,
      durationMs: clientDuration,
      thumbnailPath: null,
      size: file.size,
    };
  }

  private async acceptClientPoster(
    poster: { path?: string; size: number } | undefined,
    destPath: string,
  ): Promise<{ width: number; height: number } | null> {
    if (!poster?.path || poster.size > attachmentsMaxPosterSize) {
      await this.discardPoster(poster?.path);
      return null;
    }
    const sniffed = await this.mimeSnifferService.sniff(poster.path);
    if (
      !sniffed ||
      !(CLIENT_POSTER_MIMES as readonly string[]).includes(sniffed)
    ) {
      await this.discardPoster(poster.path);
      return null;
    }
    const encoded = await this.imageProcessingService.reencodeClientPoster(
      poster.path,
      destPath,
    );
    await this.discardPoster(poster.path);
    return encoded;
  }

  private async discardPoster(posterPath: string | undefined): Promise<void> {
    if (!posterPath) {
      return;
    }
    await fs.promises.rm(posterPath, { force: true });
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
        durationMs: null,
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
        durationMs: null,
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
        durationMs: null,
        thumbnailPath: null,
        size: file.size,
      };
    }
    return {
      mime: sniffed,
      kind: EAttachmentKind.IMAGE,
      width,
      height,
      durationMs: null,
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

function clientDurationMs(seconds: number | undefined): number | null {
  if (seconds === undefined) {
    return null;
  }
  const durationMs = Math.round(seconds * 1000);
  if (durationMs < 1) {
    return null;
  }
  return durationMs;
}

function fitVideoHints(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } | null {
  if (width === undefined || height === undefined) {
    return null;
  }
  const scale = Math.min(
    1,
    attachmentsThumbnailMaxSide / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
