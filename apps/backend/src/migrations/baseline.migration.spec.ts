import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ALL_PERMISSIONS,
  DEFAULT_MODERATOR_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
} from '@konvoez/shared';
import { MikroORM, type Options } from '@mikro-orm/core';
import knex from 'knex';
import { Migration20261116120000_Baseline } from './Migration20261116120000_Baseline';

const { createMikroOrmConfig, resolveDbEngine } =
  require('../mikro-orm.config') as {
    createMikroOrmConfig: () => Promise<Options>;
    resolveDbEngine: (rawEngine?: string) => string;
  };

describe('Baseline migration (Knex SchemaBuilder)', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;
  const masterKey = Buffer.alloc(32, 11).toString('base64');

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-mig-test-'));
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

  it('creates all tables, default roles, and rolls back cleanly with down()', async () => {
    await orm.migrator.up();

    const conn = orm.em.getConnection() as unknown as {
      getNativeClient: () => Promise<{
        prepare: (sql: string) => {
          all: () => Array<{ name: string }>;
          get: () => unknown;
        };
      }>;
    };
    const db = await conn.getNativeClient();

    const expectedTables = [
      'settings',
      'two_factor_recovery_key',
      'roles',
      'users',
      'user_roles',
      'rooms',
      'room_allowed_roles',
      'room_allowed_users',
      'messages',
      'message_search_tokens',
      'message_reads',
      'message_reactions',
      'message_mentions',
      'message_attachments',
      'push_subscriptions',
      'user_notification_settings',
      'password_recovery_codes',
      'email_verification_codes',
      'two_factor_recovery_codes',
      'invites',
    ];

    const tables = db
      .prepare("select name from sqlite_master where type='table'")
      .all()
      .map((r) => r.name);

    for (const expected of expectedTables) {
      expect(tables).toContain(expected);
    }

    // Verify seeded roles
    const roles = db
      .prepare(
        'select name, priority, is_default, permissions from roles order by priority asc',
      )
      .all() as Array<{
      name: string;
      priority: number;
      is_default: number;
      permissions: string;
    }>;
    expect(
      roles.map(({ name, priority, is_default }) => ({
        name,
        priority,
        is_default,
      })),
    ).toEqual([
      { name: 'User', priority: 0, is_default: 1 },
      { name: 'Moderator', priority: 50, is_default: 0 },
      { name: 'Admin', priority: 100, is_default: 0 },
    ]);
    expect(roles.map((role) => JSON.parse(role.permissions))).toEqual([
      [...DEFAULT_USER_PERMISSIONS],
      [...DEFAULT_MODERATOR_PERMISSIONS],
      [...ALL_PERMISSIONS],
    ]);

    // Verify default JSON values on insert
    await orm.em
      .getConnection()
      .execute(
        "insert into roles (name, created_at) values ('CustomRole', datetime('now'))",
      );
    const customRole = db
      .prepare("select permissions from roles where name = 'CustomRole'")
      .get() as { permissions: string };
    expect(customRole.permissions).toBe('[]');

    await orm.em
      .getConnection()
      .execute(
        "insert into users (username, password, fullname, email, created_at) values ('testuser', 'hash', 'Test User', 'test@example.com', datetime('now'))",
      );
    const user = db
      .prepare("select id from users where username = 'testuser'")
      .get() as { id: number };

    await orm.em
      .getConnection()
      .execute(
        `insert into messages (id, created_at, content, sender_id) values (randomblob(16), datetime('now'), 'enc-test', ${user.id})`,
      );
    const customMessage = db
      .prepare('select mentions from messages limit 1')
      .get() as { mentions: string };
    expect(customMessage.mentions).toBe(
      '{"userIds":[],"roleIds":[],"everyone":false}',
    );

    // Verify rollback
    await orm.migrator.down();

    const tablesAfterDown = db
      .prepare("select name from sqlite_master where type='table'")
      .all()
      .map((r) => r.name);

    for (const expected of expectedTables) {
      expect(tablesAfterDown).not.toContain(expected);
    }
  });

  it('compiles valid cross-DBMS DDL for PostgreSQL and MySQL dialects', () => {
    const baseline = new Migration20261116120000_Baseline(
      orm.em.getDriver() as never,
      orm.config,
    );

    const dialects = [
      { client: 'pg' },
      { client: 'mysql2' },
      { client: 'better-sqlite3' },
    ];

    for (const { client } of dialects) {
      (baseline as unknown as { knexInstance: knex.Knex }).knexInstance = knex({
        client,
        useNullAsDefault: true,
      });

      baseline.reset();
      baseline.up();

      const queries = baseline.getQueries();
      expect(queries.length).toBeGreaterThan(20);

      const pushTable = queries.find(
        (q) => q.includes('push_subscriptions') && q.includes('endpoint'),
      );
      expect(pushTable).toContain('varchar(500)');

      if (client === 'mysql2') {
        const rolesTable = queries.find(
          (q) => q.includes('roles') && q.includes('permissions'),
        );
        expect(rolesTable).toContain("default ('[]')");

        const messagesTable = queries.find(
          (q) => q.includes('messages') && q.includes('mentions'),
        );
        expect(messagesTable).toContain(
          'default (\'{"userIds":[],"roleIds":[],"everyone":false}\')',
        );
      } else {
        const rolesTable = queries.find(
          (q) => q.includes('roles') && q.includes('permissions'),
        );
        expect(rolesTable).toContain("default '[]'");

        const messagesTable = queries.find(
          (q) => q.includes('messages') && q.includes('mentions'),
        );
        expect(messagesTable).toContain(
          'default \'{"userIds":[],"roleIds":[],"everyone":false}\'',
        );
      }

      // Verify down queries as well
      baseline.reset();
      baseline.down();
      const downQueries = baseline.getQueries();
      expect(downQueries.length).toBe(20);
    }
  });

  it('throws an error if MASTER_KEY is not configured when running up()', () => {
    delete process.env['MASTER_KEY'];
    delete process.env['MASTER_KEY_FILE'];
    const baseline = new Migration20261116120000_Baseline(
      orm.em.getDriver() as never,
      orm.config,
    );

    expect(() => baseline.up()).toThrow(
      /MASTER_KEY environment variable is required/,
    );
  });

  it('supports loading MASTER_KEY from MASTER_KEY_FILE', () => {
    delete process.env['MASTER_KEY'];
    const keyFile = path.join(tmpDir, 'master-key.txt');
    fs.writeFileSync(keyFile, masterKey + '\n');
    process.env['MASTER_KEY_FILE'] = keyFile;

    const baseline = new Migration20261116120000_Baseline(
      orm.em.getDriver() as never,
      orm.config,
    );

    expect(() => baseline.up()).not.toThrow();
    expect(process.env['MASTER_KEY']).toBe(masterKey);
  });

  it('addKnex adds atomic statements from SchemaBuilder, QueryBuilder, and raw queries to Migration', () => {
    const baseline = new Migration20261116120000_Baseline(
      orm.em.getDriver() as never,
      orm.config,
    );
    const k = baseline.getKnex();

    baseline.reset();

    // 1. SchemaBuilder (returns array of statement objects)
    baseline.addKnex(
      k.schema.createTable('temp_test', (table) => {
        table.increments('id').primary();
        table.string('title').notNullable();
      }),
    );

    // 2. QueryBuilder (returns a single query object)
    baseline.addKnex(k('temp_test').insert({ title: 'test entry' }));

    // 3. Raw builder
    baseline.addKnex(
      k.raw('DELETE FROM ?? WHERE ?? = ?', ['temp_test', 'id', 1]),
    );

    const queries = baseline.getQueries();
    expect(queries.length).toBe(3);
    expect(queries[0]).toContain('create table `temp_test`');
    expect(queries[1]).toContain('insert into `temp_test`');
    expect(queries[2]).toBe('DELETE FROM `temp_test` WHERE `id` = 1');
  });

  it('getKnex resolves dialect based on DB_ENGINE and driver', () => {
    const baseline = new Migration20261116120000_Baseline(
      orm.em.getDriver() as never,
      orm.config,
    );

    process.env['DB_ENGINE'] = 'postgres';
    (baseline as unknown as { knexInstance?: unknown }).knexInstance =
      undefined;
    expect(baseline.getKnex().client.dialect).toBe('postgresql');

    process.env['DB_ENGINE'] = 'postgresql';
    (baseline as unknown as { knexInstance?: unknown }).knexInstance =
      undefined;
    expect(baseline.getKnex().client.dialect).toBe('postgresql');

    process.env['DB_ENGINE'] = 'mysql';
    (baseline as unknown as { knexInstance?: unknown }).knexInstance =
      undefined;
    expect(baseline.getKnex().client.dialect).toBe('mysql');

    process.env['DB_ENGINE'] = 'mariadb';
    (baseline as unknown as { knexInstance?: unknown }).knexInstance =
      undefined;
    expect(baseline.getKnex().client.dialect).toBe('mysql');

    process.env['DB_ENGINE'] = 'sqlite';
    (baseline as unknown as { knexInstance?: unknown }).knexInstance =
      undefined;
    expect(baseline.getKnex().client.dialect).toBe('sqlite3');
  });

  it('resolveDbEngine maps aliases and defaults to sqlite', () => {
    expect(resolveDbEngine('postgres')).toBe('postgres');
    expect(resolveDbEngine('POSTGRESQL')).toBe('postgres');
    expect(resolveDbEngine('mysql')).toBe('mysql');
    expect(resolveDbEngine('MariaDB')).toBe('mysql');
    expect(resolveDbEngine('sqlite')).toBe('sqlite');
    expect(resolveDbEngine(undefined)).toBe('sqlite');
    expect(resolveDbEngine('unknown')).toBe('sqlite');
  });
});
