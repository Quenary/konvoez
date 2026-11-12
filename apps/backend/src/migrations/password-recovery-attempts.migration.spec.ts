import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('PasswordRecoveryAttempts migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;
  let previousMasterKey: string | undefined;
  let previousVapidDir: string | undefined;
  const masterKey = Buffer.alloc(32, 11).toString('base64');

  beforeEach(async () => {
    previousMasterKey = process.env['MASTER_KEY'];
    previousVapidDir = process.env['VAPID_FILE_DIR'];
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'password-recovery-attempts-mig-test-'),
    );
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

  it('adds attempts column with default 0 to password_recovery_codes and rolls back cleanly', async () => {
    // 1. Run migrations up to InviteEmailSent
    await orm.migrator.up({
      to: 'Migration20261108005129_InviteEmailSent',
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

    // Insert an existing user and recovery code before migration
    await conn.executeDump(
      `insert into users (username, password, fullname, email, is_owner, session_version, created_at) values
       ('alice', 'hashed_pass', 'Alice', 'alice@example.com', 0, 0, CURRENT_TIMESTAMP);
       insert into password_recovery_codes (user_id, code_hash, expires_at, created_at) values
       (1, 'dummy_hash', datetime('now', '+1 hour'), CURRENT_TIMESTAMP);`,
    );

    // 2. Run PasswordRecoveryAttempts migration
    await orm.migrator.up({
      to: 'Migration20261112041029_PasswordRecoveryAttempts',
    });

    const db = await conn.getNativeClient();

    // 3. Verify column exists on password_recovery_codes
    const tableInfo = db
      .prepare('pragma table_info(password_recovery_codes)')
      .all() as Array<{ name: string; dflt_value: unknown }>;
    const attemptsCol = tableInfo.find((col) => col.name === 'attempts');
    expect(attemptsCol).toBeDefined();
    expect(attemptsCol?.dflt_value).toBe('0');

    // Verify existing record received default attempts = 0
    const record = db
      .prepare('select attempts from password_recovery_codes where id = 1')
      .get() as { attempts: number };
    expect(record.attempts).toBe(0);

    // 4. Roll back migration
    await orm.migrator.down({
      to: 'Migration20261108005129_InviteEmailSent',
    });

    // 5. Verify column was removed
    const tableInfoAfterDown = db
      .prepare('pragma table_info(password_recovery_codes)')
      .all() as Array<{ name: string }>;
    expect(
      tableInfoAfterDown.find((col) => col.name === 'attempts'),
    ).toBeUndefined();
  });
});
