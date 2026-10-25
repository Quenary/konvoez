import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('SessionVersion migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'session-version-mig-test-'),
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

  it('adds session_version column defaulting to 0 for existing rows and rolls back cleanly', async () => {
    // 1. Run migrations up to MessageMentions
    await orm.migrator.up({ to: 'Migration20261019130000_MessageMentions' });

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

    // Insert an existing user before the session_version column exists
    await conn.executeDump(
      `insert into users (username, password, fullname, email, is_owner, created_at) values
       ('alice', 'hashed_pass', 'Alice', 'alice@example.com', 1, CURRENT_TIMESTAMP);`,
    );

    // 2. Run SessionVersion migration
    await orm.migrator.up({ to: 'Migration20261026090000_SessionVersion' });

    const db = await conn.getNativeClient();

    // 3. Verify session_version column exists and defaults to 0
    const users = db
      .prepare('select username, session_version from users')
      .all() as Array<{
      username: string;
      session_version: number;
    }>;

    const alice = users.find((u) => u.username === 'alice');
    expect(alice).toBeDefined();
    expect(alice?.session_version).toBe(0);

    // 4. Test down migration
    await orm.migrator.down({
      to: 'Migration20261019130000_MessageMentions',
    });

    const columns = db.prepare('pragma table_info(users)').all() as Array<{
      name: string;
    }>;
    expect(columns.some((c) => c.name === 'session_version')).toBe(false);
  });
});
