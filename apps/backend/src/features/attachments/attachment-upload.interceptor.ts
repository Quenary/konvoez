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
import multer from 'multer';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { ESettingKey, attachmentsMaxPendingPerUser } from '@konvoez/shared';
import { AppService } from '@shared/services/app.service';
import { SettingsService } from '../settings/settings.service';
import { EAttachmentStatus, isEnospc } from './attachments.const';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { MessageAttachmentEntity } from './attachments.entity';
import type { Request, Response } from 'express';

function isUploadAborted(req: Request, error: unknown): boolean {
  if (req.destroyed) {
    return true;
  }
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
    const req = http.getRequest<Request & { file?: Express.Multer.File }>();
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
    const contentLength = Number(req.headers['content-length'] ?? 0);
    if (contentLength > maxFileSize + 64 * 1024) {
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
      limits: { fileSize: maxFileSize, files: 1, fields: 0, parts: 1 },
      defParamCharset: 'utf8',
    }).single('file');
    await new Promise<void>((resolve, reject) => {
      upload(req, res, (error: unknown) => {
        if (!error) {
          resolve();
          return;
        }
        if (isUploadAborted(req, error)) {
          this.logger.debug('Upload aborted by the client');
          reject(new BadRequestException('UPLOAD_ABORTED'));
          return;
        }
        reject(
          isEnospc(error) ? new HttpException('STORAGE_FULL', 507) : error,
        );
      });
    });
    return next.handle().pipe(
      finalize(() => {
        const filePath = req.file?.path;
        if (!filePath) {
          return;
        }
        fs.promises.rm(filePath, { force: true }).catch((error: unknown) => {
          this.logger.warn(
            `Failed to remove temp upload ${filePath}: ${error instanceof Error ? error.message : error}`,
          );
        });
      }),
    );
  }
}
