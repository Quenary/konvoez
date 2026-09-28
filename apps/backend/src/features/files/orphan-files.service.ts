import { MikroORM } from '@mikro-orm/core';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  FILE_BUCKETS,
  FileServiceInjectionToken,
  type FileService,
  type StoredFileInfo,
} from '@shared/services/file.service';
import { RoomEntity } from '../rooms/rooms.entity';
import { UserEntity } from '../users/users.entity';

@Injectable()
export class OrphanFilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrphanFilesService.name);
  /** Cleanup interval in milliseconds. */
  private readonly cleanupIntervalMs = 6 * 60 * 60_000;
  /** Grace period in milliseconds for orphan files. */
  private readonly orphanGracePeriodMs = 24 * 60 * 60_000;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly orm: MikroORM,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
  ) {}

  public onModuleInit(): void {
    void this.cleanup();
    this.timer = setInterval(() => {
      void this.cleanup();
    }, this.cleanupIntervalMs);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async cleanup(now = Date.now()): Promise<number> {
    if (this.running) {
      return 0;
    }

    this.logger.log('Cleaning up orphan files');

    this.running = true;
    try {
      const referenced = await this.loadReferencedKeys();
      let deleted = 0;

      for (const bucket of FILE_BUCKETS) {
        deleted += await this.cleanupBucket(bucket, referenced, now);
      }

      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} orphan file(s)`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(
        'Failed to delete orphan files',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async loadReferencedKeys(): Promise<Set<string>> {
    const em = this.orm.em.fork();
    const [users, rooms] = await Promise.all([
      em.find(UserEntity, { avatar: { $ne: null } }, { fields: ['avatar'] }),
      em.find(RoomEntity, { avatar: { $ne: null } }, { fields: ['avatar'] }),
    ]);

    const referenced = new Set<string>();
    for (const user of users) {
      if (user.avatar) {
        referenced.add(user.avatar);
      }
    }
    for (const room of rooms) {
      if (room.avatar) {
        referenced.add(room.avatar);
      }
    }
    return referenced;
  }

  private async cleanupBucket(
    bucket: string,
    referenced: Set<string>,
    now: number,
  ): Promise<number> {
    let files: StoredFileInfo[];
    try {
      files = await this.fileService.list(bucket);
    } catch (error) {
      this.logger.error(
        `Failed to list files in ${bucket}`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }

    let deleted = 0;
    for (const file of files) {
      if (
        referenced.has(file.key) ||
        !this.isOlderThanGracePeriod(file.modifiedAt, now)
      ) {
        continue;
      }

      try {
        await this.fileService.delete(file.key);
        deleted += 1;
      } catch (error) {
        this.logger.error(
          `Failed to delete orphan file ${file.key}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return deleted;
  }

  private isOlderThanGracePeriod(modifiedAt: Date, now: number): boolean {
    return now - modifiedAt.getTime() >= this.orphanGracePeriodMs;
  }
}
