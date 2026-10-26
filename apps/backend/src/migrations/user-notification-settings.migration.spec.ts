import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

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

  it('creates user_notification_settings table and rolls back cleanly', async () => {
    // 1. Run migrations up to TwoFactor
    await orm.migrator.up({ to: 'Migration20261026100000_TwoFactor' });

    const conn = orm.em.getConnection() as unknown as {
      executeDump: (sql: string) => Promise<void>;
      getNativeClient: () => Promise<{
        prepare: (sql: string) => {
          all: () => unknown[];
          get: () => unknown;
          run: () => void;
        };
      }>;
    };

    // 2. Run migration to UserNotificationSettings
    await orm.migrator.up({
      to: 'Migration20261026172220_UserNotificationSettings',
    });

    const client = await conn.getNativeClient();
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

    // 3. Verify upsert against real SQLite table
    client
      .prepare(
        `insert into users (id, created_at, username, password, session_version, fullname, email, is_owner) values (1, datetime('now'), 'alice', 'hash', 0, 'Alice', 'alice@test.com', 0);`,
      )
      .run();

    const {
      UserNotificationSettingsEntity,
    } = require('../features/notifications/notifications.entity');
    const { UserEntity } = require('../features/users/users.entity');

    const em = orm.em.fork();
    const userRef = em.getReference(UserEntity, 1);
    await em.upsert(
      UserNotificationSettingsEntity,
      {
        user: userRef,
        directMessages: false,
        directCalls: true,
        mentionUsername: true,
        mentionRole: true,
        mentionEveryone: false,
      },
      {
        onConflictFields: ['user'],
        onConflictAction: 'merge',
        onConflictMergeFields: [
          'directMessages',
          'mentionEveryone',
          'updatedAt',
        ],
      },
    );
    await em.flush();

    // Secondary upsert updates directCalls and mentionRole without overwriting directMessages or mentionEveryone
    await em.upsert(
      UserNotificationSettingsEntity,
      {
        user: userRef,
        directMessages: true,
        directCalls: false,
        mentionUsername: true,
        mentionRole: false,
        mentionEveryone: true,
      },
      {
        onConflictFields: ['user'],
        onConflictAction: 'merge',
        onConflictMergeFields: ['directCalls', 'mentionRole', 'updatedAt'],
      },
    );
    await em.flush();

    const row = client
      .prepare(
        `select direct_messages, direct_calls, mention_username, mention_role, mention_everyone from user_notification_settings where user_id = 1;`,
      )
      .get() as {
      direct_messages: number;
      direct_calls: number;
      mention_username: number;
      mention_role: number;
      mention_everyone: number;
    };

    expect(row.direct_messages).toBe(0);
    expect(row.direct_calls).toBe(0);
    expect(row.mention_username).toBe(1);
    expect(row.mention_role).toBe(0);
    expect(row.mention_everyone).toBe(0);

    // 4. Roll back
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
});
