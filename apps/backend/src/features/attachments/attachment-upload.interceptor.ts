import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import multer, { MulterError } from 'multer';
import fs from 'fs';
import { randomUUID } from 'crypto';
import {
  EAttachmentUploadError,
  ESettingKey,
  attachmentsMaxPendingPerUser,
  attachmentsMaxPosterSize,
} from '@konvoez/shared';
import { AppService } from '@shared/services/app.service';
import { isEnospc } from '@shared/utils/is-enospc';
import { SettingsService } from '../settings/settings.service';
import { EAttachmentStatus } from './attachments.const';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { MessageAttachmentEntity } from './attachments.entity';
import type { Request, Response } from 'express';

/** Byte cap for text hints. Invalid values are dropped by the upload schema. */
const HINT_FIELD_SIZE = 256;

function isUploadAborted(error: unknown): boolean {
  return error instanceof Error && error.message === 'Request aborted';
}

@Injectable()
export class AttachmentUploadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AttachmentUploadInterceptor.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly appService: AppService,
    @InjectRepository(MessageAttachmentEntity)
    private readonly repo: EntityRepository<MessageAttachmentEntity>,
  ) {}

  public async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<
      Request & {
        files?: {
          file?: Express.Multer.File[];
          poster?: Express.Multer.File[];
        };
      }
    >();
    const res = http.getResponse<Response>();
    const enabled = await this.settingsService.getValue(
      ESettingKey.ATTACHMENTS_ENABLED,
    );
    if (!enabled) {
      throw new ForbiddenException('ATTACHMENTS_DISABLED');
    }
    const authorId = (req as Request & { author?: { id: number } }).author?.id;
    if (authorId !== undefined) {
      const pending = await this.repo.count({
        uploader: authorId,
        status: EAttachmentStatus.PENDING,
      });
      if (pending >= attachmentsMaxPendingPerUser) {
        throw new HttpException('ATTACHMENTS_PENDING_LIMIT', 429);
      }
    }
    const maxFileSize = await this.settingsService.getValue(
      ESettingKey.ATTACHMENTS_MAX_FILE_SIZE,
    );
    if (req.headers['content-length'] === '0') {
      // Safari 26.5+ can send a picked file as an empty multipart body.
      this.logger.warn(
        `Empty upload body: userAgent=${req.headers['user-agent'] ?? 'unknown'}`,
      );
      throw new BadRequestException(EAttachmentUploadError.EMPTY);
    }
    const contentLength = Number(req.headers['content-length'] ?? 0);
    if (contentLength > maxFileSize + attachmentsMaxPosterSize + 64 * 1024) {
      throw new PayloadTooLargeException({ message: 'FILE_TOO_BIG' });
    }
    await fs.promises.mkdir(this.appService.UPLOAD_TMP_DIR, {
      recursive: true,
    });
    const upload = multer({
      storage: multer.diskStorage({
        destination: this.appService.UPLOAD_TMP_DIR,
        filename: (_request, _file, callback) => callback(null, randomUUID()),
      }),
      limits: {
        fileSize: Math.max(maxFileSize, attachmentsMaxPosterSize),
        files: 2,
        fields: 3,
        fieldSize: HINT_FIELD_SIZE,
        parts: 5,
      },
      defParamCharset: 'utf8',
    }).fields([
      { name: 'file', maxCount: 1 },
      { name: 'poster', maxCount: 1 },
    ]);
    await new Promise<void>((resolve, reject) => {
      upload(req, res, (error: unknown) => {
        if (!error) {
          resolve();
          return;
        }
        if (error instanceof MulterError) {
          reject(error);
          return;
        }
        if (isEnospc(error)) {
          reject(new HttpException('STORAGE_FULL', 507));
          return;
        }
        if (isUploadAborted(error)) {
          this.logger.debug('Upload aborted by the client');
          reject(new BadRequestException('UPLOAD_ABORTED'));
          return;
        }
        reject(error);
      });
    });
    const video = req.files?.file?.[0];
    const poster = req.files?.poster?.[0];
    if (video && video.size > maxFileSize) {
      this.removeTemp(video.path);
      this.removeTemp(poster?.path);
      throw new PayloadTooLargeException({ message: 'FILE_TOO_BIG' });
    }
    if (poster && poster.size > attachmentsMaxPosterSize) {
      this.removeTemp(poster.path);
      if (req.files) {
        req.files.poster = [];
      }
    }
    return next.handle().pipe(
      finalize(() => {
        this.removeTemp(req.files?.file?.[0]?.path);
        this.removeTemp(req.files?.poster?.[0]?.path);
      }),
    );
  }

  private removeTemp(filePath: string | undefined): void {
    if (!filePath) {
      return;
    }
    fs.promises.rm(filePath, { force: true }).catch((error: unknown) => {
      this.logger.warn(
        `Failed to remove temp upload ${filePath}: ${error instanceof Error ? error.message : error}`,
      );
    });
  }
}
