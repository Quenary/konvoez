import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';
import {
  BASELINE_MIGRATION_NAME,
  LEGACY_MIGRATION_MARKER,
  runMigrations,
} from './migration-runner';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

const ADD_USER_TIMESTAMPS_MIGRATION_NAME =
  'Migration20261125001229_AddUserLastSeenAndLastLogin';
const EXPECTED_EXECUTED_MIGRATIONS = [
  BASELINE_MIGRATION_NAME,
  ADD_USER_TIMESTAMPS_MIGRATION_NAME,
];

describe('Migration runner (legacy stamping and version safety)', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;
  const masterKey = Buffer.alloc(32, 11).toString('base64');

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-mig-test-'));
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
  });

  it('State 1: runs baseline migration normally on a fresh database', async () => {
    const storage = orm.migrator.getStorage();
    const executedBefore = await storage.executed();
    expect(executedBefore).toHaveLength(0);

    await runMigrations(orm);

    const executedAfter = await storage.executed();
    expect(executedAfter).toEqual(EXPECTED_EXECUTED_MIGRATIONS);

    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => {
          all: () => Array<{ name: string }>;
        };
      }>;
    };
    const db = await conn.getNativeClient();
    const tables = db
      .prepare("select name from sqlite_master where type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toContain('users');
    expect(tables).toContain('rooms');
    expect(tables).toContain('messages');
  });

  it('State 2: stamps baseline migration on upgrading from the latest previous release', async () => {
    const storage = orm.migrator.getStorage();
    await storage.ensureTable?.();

    // Simulate legacy migration history up to LEGACY_MIGRATION_MARKER
    await storage.logMigration({ name: 'Migration20260801010402' });
    await storage.logMigration({
      name: 'Migration20261017170127_RolesAndRoomAccess',
    });
    await storage.logMigration({ name: LEGACY_MIGRATION_MARKER });

    const executedBefore = await storage.executed();
    expect(executedBefore).toContain(LEGACY_MIGRATION_MARKER);
    expect(executedBefore).not.toContain(BASELINE_MIGRATION_NAME);

    // Create existing tables and data representing real database state before upgrade
    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => {
          run: () => void;
          get: () => unknown;
        };
      }>;
    };
    const db = await conn.getNativeClient();
    db.prepare(
      "create table users (id integer primary key autoincrement, username text not null, email text not null, created_at datetime not null default CURRENT_TIMESTAMP, password text not null, fullname text not null, last_detected_locale text not null default 'en')",
    ).run();
    db.prepare(
      "insert into users (username, email, password, fullname) values ('alice', 'alice@example.com', 'hash', 'Alice')",
    ).run();

    await runMigrations(orm);

    const executedAfter = await storage.executed();
    // Legacy migrations are cleared, baseline is stamped, and subsequent migrations run
    expect(executedAfter).toEqual(EXPECTED_EXECUTED_MIGRATIONS);
    expect(executedAfter).not.toContain(LEGACY_MIGRATION_MARKER);

    // Existing user data is intact and tables were not wiped
    const user = db
      .prepare("select username, email from users where username = 'alice'")
      .get() as { username: string; email: string };
    expect(user).toEqual({
      username: 'alice',
      email: 'alice@example.com',
    });
  });

  it('State 2b: stamps baseline when legacy marker timestamp is without suffix', async () => {
    const storage = orm.migrator.getStorage();
    await storage.ensureTable?.();

    await storage.logMigration({ name: 'Migration20261116083850' });
    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => { run: () => void };
      }>;
    };
    const db = await conn.getNativeClient();
    db.prepare(
      "create table users (id integer primary key autoincrement, username text not null, email text not null, created_at datetime not null default CURRENT_TIMESTAMP, password text not null, fullname text not null, last_detected_locale text not null default 'en')",
    ).run();

    await runMigrations(orm);

    const executedAfter = await storage.executed();
    expect(executedAfter).toEqual(EXPECTED_EXECUTED_MIGRATIONS);
  });

  it('State 2c: stamps baseline when legacy marker has arbitrary suffix variant', async () => {
    const storage = orm.migrator.getStorage();
    await storage.ensureTable?.();

    await storage.logMigration({
      name: 'Migration20261116083850_RoomOrderMigration',
    });
    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => { run: () => void };
      }>;
    };
    const db = await conn.getNativeClient();
    db.prepare(
      "create table users (id integer primary key autoincrement, username text not null, email text not null, created_at datetime not null default CURRENT_TIMESTAMP, password text not null, fullname text not null, last_detected_locale text not null default 'en')",
    ).run();

    await runMigrations(orm);

    const executedAfter = await storage.executed();
    expect(executedAfter).toEqual(EXPECTED_EXECUTED_MIGRATIONS);
  });

  it('State 3: throws error on outdated legacy database missing the legacy marker', async () => {
    const storage = orm.migrator.getStorage();
    await storage.ensureTable?.();

    // Simulate outdated legacy database lacking the latest marker
    await storage.logMigration({ name: 'Migration20260801010402' });
    await storage.logMigration({ name: 'Migration20260915000000' });

    await expect(runMigrations(orm)).rejects.toThrow(
      new RegExp(
        `missing the required release marker '${LEGACY_MIGRATION_MARKER}'`,
      ),
    );
  });

  it('State 4: does not re-stamp if baseline migration is already executed', async () => {
    await runMigrations(orm);

    const storage = orm.migrator.getStorage();
    const executedFirst = await storage.executed();
    expect(executedFirst).toEqual(EXPECTED_EXECUTED_MIGRATIONS);

    // Running migrations again should be a no-op
    await runMigrations(orm);

    const executedSecond = await storage.executed();
    expect(executedSecond).toEqual(EXPECTED_EXECUTED_MIGRATIONS);
  });
});
