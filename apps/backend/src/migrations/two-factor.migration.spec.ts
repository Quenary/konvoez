import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('TwoFactor migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'two-factor-mig-test-'));
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

  it('adds 2FA columns, creates two_factor_recovery_codes table, and rolls back cleanly', async () => {
    // 1. Run migrations up to SessionVersion
    await orm.migrator.up({ to: 'Migration20261026090000_SessionVersion' });

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

    // Insert an existing user before 2FA migration
    await conn.executeDump(
      `insert into users (username, password, fullname, email, is_owner, session_version, created_at) values
       ('bob', 'hashed_pass', 'Bob', 'bob@example.com', 0, 1, CURRENT_TIMESTAMP);`,
    );

    // 2. Run TwoFactor migration
    await orm.migrator.up({ to: 'Migration20261026100000_TwoFactor' });

    const db = await conn.getNativeClient();

    // 3. Verify columns exist on users
    const userColumns = db.prepare('pragma table_info(users)').all() as Array<{
      name: string;
    }>;
    const colNames = userColumns.map((c) => c.name);
    expect(colNames).toContain('two_factor_secret');
    expect(colNames).toContain('two_factor_enabled_at');
    expect(colNames).toContain('two_factor_last_step');

    // Verify existing user has null for these columns
    const users = db
      .prepare(
        "select username, two_factor_secret, two_factor_enabled_at, two_factor_last_step from users where username = 'bob'",
      )
      .all() as Array<{
      username: string;
      two_factor_secret: string | null;
      two_factor_enabled_at: string | null;
      two_factor_last_step: number | null;
    }>;
    expect(users[0]?.two_factor_secret).toBeNull();
    expect(users[0]?.two_factor_enabled_at).toBeNull();
    expect(users[0]?.two_factor_last_step).toBeNull();

    // 4. Verify recovery codes table exists and accepts records
    await conn.executeDump(
      `insert into two_factor_recovery_codes (created_at, user_id, code_hash) values
       (CURRENT_TIMESTAMP, 1, 'v1:dummyhash');`,
    );
    const codes = db
      .prepare('select * from two_factor_recovery_codes')
      .all() as unknown[];
    expect(codes.length).toBe(1);

    // 5. Test down migration
    await orm.migrator.down({
      to: 'Migration20261026090000_SessionVersion',
    });

    const tables = db
      .prepare(
        "select name from sqlite_master where type = 'table' and name = 'two_factor_recovery_codes'",
      )
      .all() as unknown[];
    expect(tables.length).toBe(0);

    const revertedColumns = db
      .prepare('pragma table_info(users)')
      .all() as Array<{ name: string }>;
    const revertedNames = revertedColumns.map((c) => c.name);
    expect(revertedNames).not.toContain('two_factor_secret');
    expect(revertedNames).not.toContain('two_factor_enabled_at');
    expect(revertedNames).not.toContain('two_factor_last_step');
  });
});
