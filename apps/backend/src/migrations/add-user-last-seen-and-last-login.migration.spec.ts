import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';
import knex from 'knex';
import { UserEntity } from '../features/users/users.entity';
import { Migration20261125001229_AddUserLastSeenAndLastLogin } from './Migration20261125001229_AddUserLastSeenAndLastLogin';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('Migration20261125001229_AddUserLastSeenAndLastLogin', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;
  const masterKey = Buffer.alloc(32, 11).toString('base64');

  const envKeys = [
    'DB_ENGINE',
    'DB_NAME',
    'VAPID_FILE_DIR',
    'MASTER_KEY',
  ] as const;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-ts-mig-test-'));
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
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds nullable last_seen_at and last_login_at columns to users and rolls back cleanly with down()', async () => {
    await orm.migrator.up({ to: 'Migration20261116120000_Baseline' });

    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => {
          all: () => Array<{ name: string }>;
          get: () => unknown;
        };
      }>;
    };
    const db = await conn.getNativeClient();

    const columnsBefore = db
      .prepare("pragma table_info('users')")
      .all()
      .map((col) => col.name);
    expect(columnsBefore).not.toContain('last_seen_at');
    expect(columnsBefore).not.toContain('last_login_at');

    await orm.em
      .getConnection()
      .execute(
        "insert into users (username, password, fullname, email, created_at) values ('existinguser', 'hash', 'Existing User', 'existing@example.com', datetime('now'))",
      );

    await orm.migrator.up();

    const columnsAfter = db
      .prepare("pragma table_info('users')")
      .all()
      .map((col) => col.name);
    expect(columnsAfter).toContain('last_seen_at');
    expect(columnsAfter).toContain('last_login_at');

    const existingUser = db
      .prepare(
        "select id, last_seen_at, last_login_at from users where username = 'existinguser'",
      )
      .get() as { id: number; last_seen_at: unknown; last_login_at: unknown };
    expect(existingUser.last_seen_at).toBeNull();
    expect(existingUser.last_login_at).toBeNull();

    await orm.em
      .getConnection()
      .execute(
        "insert into users (username, password, fullname, email, created_at) values ('newuser', 'hash', 'New User', 'new@example.com', datetime('now'))",
      );
    const newUser = db
      .prepare(
        "select id, last_seen_at, last_login_at from users where username = 'newuser'",
      )
      .get() as { id: number; last_seen_at: unknown; last_login_at: unknown };
    expect(newUser.last_seen_at).toBeNull();
    expect(newUser.last_login_at).toBeNull();

    const seenAt = new Date('2026-11-25T01:02:03.000Z');
    const loginAt = new Date('2026-11-25T01:00:00.000Z');
    const checkEm = orm.em.fork();
    await checkEm.nativeUpdate(
      UserEntity,
      { id: newUser.id },
      { lastSeenAt: seenAt, lastLoginAt: loginAt },
    );
    const loadedUser = await checkEm.findOneOrFail(UserEntity, {
      id: newUser.id,
    });
    expect(loadedUser.lastSeenAt).toEqual(seenAt);
    expect(loadedUser.lastLoginAt).toEqual(loginAt);

    await orm.migrator.down();

    const columnsAfterDown = db
      .prepare("pragma table_info('users')")
      .all()
      .map((col) => col.name);
    expect(columnsAfterDown).not.toContain('last_seen_at');
    expect(columnsAfterDown).not.toContain('last_login_at');

    const preservedUser = db
      .prepare("select username from users where username = 'existinguser'")
      .get() as { username: string } | undefined;
    expect(preservedUser).toEqual({ username: 'existinguser' });
  });

  it('compiles cross-DBMS up and down DDL', () => {
    const migration = new Migration20261125001229_AddUserLastSeenAndLastLogin(
      orm.em.getDriver() as never,
      orm.config,
    );

    for (const { client, quote } of [
      { client: 'pg', quote: '"' },
      { client: 'mysql2', quote: '`' },
      { client: 'better-sqlite3', quote: '`' },
    ]) {
      (migration as unknown as { knexInstance: knex.Knex }).knexInstance = knex(
        {
          client,
          useNullAsDefault: true,
        },
      );

      migration.reset();
      migration.up();
      const upQueries = migration.getQueries();
      const upSql = upQueries.join(';');
      expect(upQueries.length).toBeGreaterThanOrEqual(1);
      expect(upSql.toLowerCase()).toContain('alter table');
      expect(upSql).toContain(`${quote}users${quote}`);
      expect(upSql).toContain(`${quote}last_seen_at${quote}`);
      expect(upSql).toContain(`${quote}last_login_at${quote}`);
      expect(upSql.toLowerCase()).not.toContain('not null');

      migration.reset();
      migration.down();
      const downQueries = migration.getQueries();
      expect(downQueries).toEqual([
        `ALTER TABLE ${quote}users${quote} DROP COLUMN ${quote}last_seen_at${quote}`,
        `ALTER TABLE ${quote}users${quote} DROP COLUMN ${quote}last_login_at${quote}`,
      ]);
    }
  });
});
