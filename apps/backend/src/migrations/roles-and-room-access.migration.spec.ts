import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM } from '@mikro-orm/core';
import { createMikroOrmConfig } from '../mikro-orm.config';

describe('RolesAndRoomAccess migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-mig-test-'));
    dbPath = path.join(tmpDir, 'db.sqlite');
    process.env.DB_ENGINE = 'sqlite';
    process.env.DB_NAME = dbPath;

    const config = await createMikroOrmConfig();
    orm = await MikroORM.init(config);
  });

  afterEach(async () => {
    if (orm) {
      await orm.close(true);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('migrates existing databases with foreign keys intact and without data loss', async () => {
    // 1. Run migrations up to MessageReactions
    await orm.migrator.up({ to: 'Migration20261009130000_MessageReactions' });

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

    // 2. Seed with raw SQL
    await conn.executeDump(
      `insert into users (id, created_at, username, password, fullname, email, role) values
       (1, CURRENT_TIMESTAMP, 'admin_user', 'hash1', 'Admin User', 'admin@example.com', 'ADMIN'),
       (2, CURRENT_TIMESTAMP, 'member_user', 'hash2', 'Member User', 'member@example.com', 'MEMBER'),
       (3, CURRENT_TIMESTAMP, 'owner_user', 'hash3', 'Owner User', 'owner@example.com', 'OWNER');

       insert into rooms (id, created_at, name, type, author_id) values
       (1, CURRENT_TIMESTAMP, 'General', 'TEXT', 2);

       insert into messages (id, created_at, content_encrypted, iv, auth_tag, sender_id, room_id) values
       (zeroblob(16), CURRENT_TIMESTAMP, zeroblob(10), zeroblob(12), zeroblob(16), 1, 1);

       insert into message_reads (message_id, reader_id, read_at) values
       (zeroblob(16), 1, CURRENT_TIMESTAMP);`,
    );

    // 3. Run the remaining migrations (including RolesAndRoomAccess)
    await orm.migrator.up();

    const db = await conn.getNativeClient();

    // 4. Assert counts
    const usersCount = (
      db.prepare('select count(*) as count from users').get() as {
        count: number;
      }
    ).count;
    const messagesCount = (
      db.prepare('select count(*) as count from messages').get() as {
        count: number;
      }
    ).count;
    const messageReadsCount = (
      db.prepare('select count(*) as count from message_reads').get() as {
        count: number;
      }
    ).count;

    expect(Number(usersCount)).toBe(3);
    expect(Number(messagesCount)).toBe(1);
    expect(Number(messageReadsCount)).toBe(1);

    // 5. Assert user_roles has exactly (1, Admin role id)
    const adminRole = db
      .prepare("select id from roles where name = 'Admin'")
      .get() as { id: number } | undefined;
    expect(adminRole).toBeDefined();

    const userRoles = db
      .prepare('select user_id, role_id from user_roles')
      .all() as { user_id: number; role_id: number }[];
    expect(userRoles).toEqual([{ user_id: 1, role_id: adminRole?.id }]);

    // 6. Assert is_owner is 1 only for id 3
    const owners = db
      .prepare('select id from users where is_owner = 1')
      .all() as { id: number }[];
    expect(owners).toEqual([{ id: 3 }]);

    // 7. Assert pragma foreign_keys returns 1
    const fkPragma = db.prepare('pragma foreign_keys;').get() as {
      foreign_keys: number;
    };
    expect(Number(fkPragma.foreign_keys)).toBe(1);
  }, 30000);
});
