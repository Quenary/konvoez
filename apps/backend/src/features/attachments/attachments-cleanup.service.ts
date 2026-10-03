import type { EntityManager, FilterQuery } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/core';
import {
  Inject,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(AttachmentsCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private expiredDue = false;
  private detachedDue = false;
  private tempDue = false;

  constructor(
    private readonly orm: MikroORM,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
    private readonly appService: AppService,
  ) {}

  public onModuleInit(): void {
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
    this.expiredDue = true;
    this.detachedDue = true;
    this.tempDue = true;
    await this.run();
  }

  public async purgeDetached(): Promise<void> {
    this.detachedDue = true;
    await this.run();
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

  private async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      while (this.expiredDue || this.detachedDue || this.tempDue) {
        const expired = this.expiredDue;
        const detached = this.detachedDue;
        const temp = this.tempDue;
        this.expiredDue = false;
        this.detachedDue = false;
        this.tempDue = false;
        if (expired) {
          await this.deleteExpiredPending();
        }
        if (detached) {
          await this.deleteDetachedRows();
        }
        if (temp) {
          await this.sweepTempDir();
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to sweep attachments',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private async deleteExpiredPending(now = Date.now()): Promise<void> {
    const cutoff = new Date(now - attachmentsPendingTtlMs);
    await this.drain({
      status: EAttachmentStatus.PENDING,
      createdAt: { $lt: cutoff },
    });
  }

  private async deleteDetachedRows(): Promise<void> {
    await this.drain({
      $or: [
        { status: EAttachmentStatus.ATTACHED, message: null },
        { status: EAttachmentStatus.PENDING, uploader: null },
      ],
    });
  }

  private async drain(
    where: FilterQuery<MessageAttachmentEntity>,
  ): Promise<void> {
    for (;;) {
      const em = this.orm.em.fork();
      const rows = await em.find(MessageAttachmentEntity, where, {
        limit: BATCH_SIZE,
      });
      if (rows.length === 0) {
        return;
      }
      await this.deleteRows(em, rows);
      em.clear();
      if (rows.length < BATCH_SIZE) {
        return;
      }
    }
  }

  private async deleteRows(
    em: EntityManager,
    rows: MessageAttachmentEntity[],
  ): Promise<void> {
    for (const row of rows) {
      await this.fileService.delete(row.storageKey).catch(() => undefined);
      if (row.thumbnailKey) {
        await this.fileService.delete(row.thumbnailKey).catch(() => undefined);
      }
      em.remove(row);
    }
    if (rows.length > 0) {
      await em.flush();
    }
  }
}
