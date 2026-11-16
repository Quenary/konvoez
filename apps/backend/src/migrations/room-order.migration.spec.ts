import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('RoomOrder migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;
  let previousMasterKey: string | undefined;
  let previousVapidDir: string | undefined;
  const masterKey = Buffer.alloc(32, 11).toString('base64');

  beforeEach(async () => {
    previousMasterKey = process.env['MASTER_KEY'];
    previousVapidDir = process.env['VAPID_FILE_DIR'];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-order-mig-test-'));
    dbPath = path.join(tmpDir, 'db.sqlite');
    process.env['DB_ENGINE'] = 'sqlite';
    process.env['DB_NAME'] = dbPath;
    process.env['VAPID_FILE_DIR'] = tmpDir;
    process.env['MASTER_KEY'] = masterKey;

    const config = await createMikroOrmConfig();
    orm = await MikroORM.init(config);
  });

  afterEach(async () => {
    if (orm) {
      await orm.close(true);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (previousMasterKey === undefined) {
      delete process.env['MASTER_KEY'];
    } else {
      process.env['MASTER_KEY'] = previousMasterKey;
    }
    if (previousVapidDir === undefined) {
      delete process.env['VAPID_FILE_DIR'];
    } else {
      process.env['VAPID_FILE_DIR'] = previousVapidDir;
    }
  });

  it('adds order column to rooms and rolls back cleanly', async () => {
    // 1. Run migrations up to UserLanguageAndDetectedLocale
    await orm.migrator.up({
      to: 'Migration20261115023712_UserLanguageAndDetectedLocale',
    });

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

    // Insert an existing user and room before migration
    await conn.executeDump(
      `insert into users (username, password, fullname, email, is_owner, session_version, created_at) values
       ('bob', 'hashed_pass', 'Bob', 'bob@example.com', 0, 0, CURRENT_TIMESTAMP);
       insert into rooms (name, type, author_id, created_at) values
       ('general', 'TEXT', 1, CURRENT_TIMESTAMP);`,
    );

    // 2. Run RoomOrder migration
    await orm.migrator.up({
      to: 'Migration20261116083850_RoomOrder',
    });

    const db = await conn.getNativeClient();

    // 3. Verify order column exists on rooms
    const tableInfo = db.prepare('pragma table_info(rooms)').all() as Array<{
      name: string;
      dflt_value: unknown;
    }>;
    const orderCol = tableInfo.find((col) => col.name === 'order');
    expect(orderCol).toBeDefined();
    expect(orderCol?.dflt_value).toBe('0');

    // Verify existing record received default order = 0
    const record = db
      .prepare("select `order` from rooms where name = 'general'")
      .get() as { order: number };
    expect(record.order).toBe(0);

    // 4. Roll back migration
    await orm.migrator.down({
      to: 'Migration20261115023712_UserLanguageAndDetectedLocale',
    });

    // 5. Verify order column was removed
    const tableInfoAfterDown = db
      .prepare('pragma table_info(rooms)')
      .all() as Array<{ name: string }>;
    expect(
      tableInfoAfterDown.find((col) => col.name === 'order'),
    ).toBeUndefined();
  });
});
