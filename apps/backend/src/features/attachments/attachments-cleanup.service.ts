import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import fs from 'fs';
import path from 'path';
import { attachmentsPendingTtlMs } from '@konvoez/shared';
import {
  FileServiceInjectionToken,
  type FileService,
} from '@shared/services/file.service';
import { AppService } from '@shared/services/app.service';
import { EntitySyncDomainEvents } from '@shared/events/entity-sync.events';
import { TextRoomDomainEvents } from '@shared/events/text-room.events';
import { EAttachmentStatus } from './attachments.const';
import { MessageAttachmentEntity } from './attachments.entity';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const TMP_GRACE_MS = 60 * 60 * 1000;
const BATCH_SIZE = 100;

@Injectable()
export class AttachmentsCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly em: EntityManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(MessageAttachmentEntity)
    private readonly repo: EntityRepository<MessageAttachmentEntity>,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
    private readonly appService: AppService,
  ) {
    this.em = this.repo.getEntityManager();
  }

  public onModuleInit(): void {
    void this.sweepTempDir();
    void this.sweep();
    this.timer = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  @OnEvent(TextRoomDomainEvents.MESSAGE_DELETED)
  @OnEvent(EntitySyncDomainEvents.ROOM_DELETED)
  @OnEvent(EntitySyncDomainEvents.USER_DELETED)
  public onDeleted(): void {
    void this.purgeDetached();
  }

  public async sweep(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.deleteExpiredPending();
      await this.deleteDetachedRows();
    } finally {
      this.running = false;
    }
  }

  public async purgeDetached(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.deleteDetachedRows();
    } finally {
      this.running = false;
    }
  }

  public async sweepTempDir(now = Date.now()): Promise<void> {
    let names: string[];
    try {
      names = await fs.promises.readdir(this.appService.UPLOAD_TMP_DIR);
    } catch {
      return;
    }
    await Promise.all(
      names.map(async (name) => {
        const fullPath = path.join(this.appService.UPLOAD_TMP_DIR, name);
        try {
          const stat = await fs.promises.stat(fullPath);
          if (now - stat.mtimeMs >= TMP_GRACE_MS) {
            await fs.promises.unlink(fullPath);
          }
        } catch {
          return;
        }
      }),
    );
  }

  private async deleteExpiredPending(now = Date.now()): Promise<void> {
    const cutoff = new Date(now - attachmentsPendingTtlMs);
    const rows = await this.repo.find(
      {
        status: EAttachmentStatus.PENDING,
        createdAt: { $lt: cutoff },
      },
      { limit: BATCH_SIZE },
    );
    await this.deleteRows(rows);
  }

  private async deleteDetachedRows(): Promise<void> {
    const rows = await this.repo.find(
      {
        $or: [
          { status: EAttachmentStatus.ATTACHED, message: null },
          { status: EAttachmentStatus.PENDING, uploader: null },
        ],
      },
      { limit: BATCH_SIZE },
    );
    await this.deleteRows(rows);
  }

  private async deleteRows(rows: MessageAttachmentEntity[]): Promise<void> {
    for (const row of rows) {
      await this.fileService.delete(row.storageKey).catch(() => undefined);
      if (row.thumbnailKey) {
        await this.fileService.delete(row.thumbnailKey).catch(() => undefined);
      }
      this.em.remove(row);
    }
    if (rows.length > 0) {
      await this.em.flush();
    }
  }
}
