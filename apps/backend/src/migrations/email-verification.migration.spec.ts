import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('EmailVerification migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'email-verification-mig-test-'),
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

  it('adds email_verified and pending_email columns, creates email_verification_codes table and indexes, and rolls back cleanly', async () => {
    // 1. Run migrations up to UserNotificationSettingsReplies
    await orm.migrator.up({
      to: 'Migration20261027192655_UserNotificationSettingsReplies',
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

    // Insert an existing user before email verification migration
    await conn.executeDump(
      `insert into users (username, password, fullname, email, is_owner, session_version, created_at) values
       ('alice', 'hashed_pass', 'Alice', 'alice@example.com', 0, 0, CURRENT_TIMESTAMP);`,
    );

    // 2. Run EmailVerification migration
    await orm.migrator.up({
      to: 'Migration20261101000000_EmailVerification',
    });

    const db = await conn.getNativeClient();

    // 3. Verify columns exist on users and defaults are correct
    const userColumns = db.prepare('pragma table_info(users)').all() as Array<{
      name: string;
    }>;
    const colNames = userColumns.map((c) => c.name);
    expect(colNames).toContain('email_verified');
    expect(colNames).toContain('pending_email');

    const users = db
      .prepare(
        "select username, email_verified, pending_email from users where username = 'alice'",
      )
      .all() as Array<{
      username: string;
      email_verified: number;
      pending_email: string | null;
    }>;
    expect(users[0]?.email_verified).toBe(0);
    expect(users[0]?.pending_email).toBeNull();

    // 4. Verify email_verification_codes table exists and accepts records
    await conn.executeDump(
      `insert into email_verification_codes (created_at, user_id, email, code_hash, attempts, expires_at) values
       (CURRENT_TIMESTAMP, 1, 'alice@example.com', 'dummy_hash', 0, CURRENT_TIMESTAMP);`,
    );
    const codes = db
      .prepare('select * from email_verification_codes')
      .all() as unknown[];
    expect(codes.length).toBe(1);

    // 5. Verify indexes exist on email_verification_codes
    const indexes = db
      .prepare(
        "select name from sqlite_master where type = 'index' and tbl_name = 'email_verification_codes'",
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('email_verification_codes_user_id_index');
    expect(indexNames).toContain('email_verification_codes_email_index');

    // 6. Test down migration
    await orm.migrator.down({
      to: 'Migration20261027192655_UserNotificationSettingsReplies',
    });

    const tables = db
      .prepare(
        "select name from sqlite_master where type = 'table' and name = 'email_verification_codes'",
      )
      .all() as unknown[];
    expect(tables.length).toBe(0);

    const revertedColumns = db
      .prepare('pragma table_info(users)')
      .all() as Array<{ name: string }>;
    const revertedNames = revertedColumns.map((c) => c.name);
    expect(revertedNames).not.toContain('email_verified');
    expect(revertedNames).not.toContain('pending_email');

    const remainingUsers = db
      .prepare("select username from users where username = 'alice'")
      .all() as Array<{ username: string }>;
    expect(remainingUsers.length).toBe(1);
  });
});
