import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DEFAULT_USER_NOTIFICATION_SETTINGS, EUserRole } from '@konvoez/shared';
import { createMikroOrmConfig } from '../mikro-orm.config';
import { NotificationsService } from '../features/notifications/notifications.service';
import {
  PushSubscriptionEntity,
  UserNotificationSettingsEntity,
} from '../features/notifications/notifications.entity';
import { VapidKeyStorageService } from '../features/notifications/vapid-key-storage.service';
import { SettingsService } from '../features/settings/settings.service';
import { GetUserSafeDto } from '../features/users/users.dto';

describe('UserNotificationSettings migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'user-notif-settings-mig-test-'),
    );
    dbPath = path.join(tmpDir, 'db.sqlite');
    process.env['DB_ENGINE'] = 'sqlite';
    process.env['DB_NAME'] = dbPath;

    const config = await createMikroOrmConfig();
    orm = await MikroORM.init(config);
  });

  afterEach(async () => {
    if (orm) {
      await orm.close(true);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the table with a single unique index on user_id and rolls back cleanly', async () => {
    await orm.migrator.up({ to: 'Migration20261026100000_TwoFactor' });

    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => {
          all: () => unknown[];
          get: () => unknown;
          run: () => void;
        };
      }>;
    };
    const client = await conn.getNativeClient();

    client
      .prepare(
        `insert into users (id, created_at, username, password, session_version, fullname, email, is_owner) values (1, datetime('now'), 'alice', 'hash', 0, 'Alice', 'alice@test.com', 0);`,
      )
      .run();

    await orm.migrator.up({
      to: 'Migration20261026172220_UserNotificationSettings',
    });

    const columns = client
      .prepare(`pragma table_info(user_notification_settings);`)
      .all() as { name: string; dflt_value: unknown }[];

    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('direct_messages');
    expect(colNames).toContain('direct_calls');
    expect(colNames).toContain('mention_username');
    expect(colNames).toContain('mention_role');
    expect(colNames).toContain('mention_everyone');

    const indexes = client
      .prepare(`pragma index_list(user_notification_settings);`)
      .all() as { name: string }[];
    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.name).toBe('user_notification_settings_user_id_unique');

    const updateSql = await orm.schema.getUpdateSchemaSQL();
    expect(updateSql).not.toContain('user_notification_settings');

    await orm.migrator.down({
      to: 'Migration20261026100000_TwoFactor',
    });

    const tablesAfterDown = client
      .prepare(
        `select name from sqlite_master where type='table' and name='user_notification_settings';`,
      )
      .all();
    expect(tablesAfterDown).toHaveLength(0);
  });

  it('reads defaults and upserts partial updates through the service', async () => {
    await orm.migrator.up({
      to: 'Migration20261026172220_UserNotificationSettings',
    });

    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => {
          all: () => unknown[];
          get: () => unknown;
          run: () => void;
        };
      }>;
    };
    const client = await conn.getNativeClient();

    client
      .prepare(
        `insert into users (id, created_at, username, password, session_version, fullname, email, is_owner) values (1, datetime('now'), 'alice', 'hash', 0, 'Alice', 'alice@test.com', 0);`,
      )
      .run();

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        EventEmitter2,
        {
          provide: getRepositoryToken(PushSubscriptionEntity),
          useValue: orm.em.getRepository(PushSubscriptionEntity),
        },
        {
          provide: getRepositoryToken(UserNotificationSettingsEntity),
          useValue: orm.em.getRepository(UserNotificationSettingsEntity),
        },
        {
          provide: SettingsService,
          useValue: { getValue: jest.fn() },
        },
        {
          provide: VapidKeyStorageService,
          useValue: {},
        },
      ],
    }).compile();

    const notificationsService = moduleRef.get(NotificationsService);

    const user: GetUserSafeDto = {
      id: 1,
      username: 'alice',
      fullname: 'Alice Smith',
      role: EUserRole.MEMBER,
      isOwner: false,
      roles: [],
      permissions: [],
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: null,
    };

    const initialSettings =
      await notificationsService.getUserNotificationSettings(user.id);
    expect(initialSettings).toEqual(DEFAULT_USER_NOTIFICATION_SETTINGS);

    const afterFirstUpdate =
      await notificationsService.updateUserNotificationSettings(user, {
        directMessages: false,
      });
    expect(afterFirstUpdate).toEqual({
      ...DEFAULT_USER_NOTIFICATION_SETTINGS,
      directMessages: false,
    });

    const afterSecondUpdate =
      await notificationsService.updateUserNotificationSettings(user, {
        mentions: { role: false },
      });
    expect(afterSecondUpdate).toEqual({
      directMessages: false,
      directCalls: true,
      mentions: {
        username: true,
        role: false,
        everyone: true,
      },
    });

    const rows = client
      .prepare(`select * from user_notification_settings where user_id = 1;`)
      .all();
    expect(rows).toHaveLength(1);

    const batch = await notificationsService.getUserNotificationSettingsBatch([
      user.id,
      999,
    ]);
    expect(batch.get(user.id)).toEqual({
      directMessages: false,
      directCalls: true,
      mentions: {
        username: true,
        role: false,
        everyone: true,
      },
    });
    expect(batch.get(999)).toEqual(DEFAULT_USER_NOTIFICATION_SETTINGS);

    await moduleRef.close();
  });
});
