import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('MessageMentions migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'message-mentions-mig-test-'),
    );
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

  it('adds mentions column to messages and creates message_mentions table with cascade', async () => {
    // 1. Run migrations up to MentionableRoles
    await orm.migrator.up({ to: 'Migration20261019120000_MentionableRoles' });

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

    // Seed user and room
    await conn.executeDump(
      `insert into users (id, username, email, password, fullname, is_owner, created_at, updated_at) values
       (1, 'alice', 'alice@test.com', 'hash', 'Alice', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       (2, 'bob', 'bob@test.com', 'hash', 'Bob', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
       insert into rooms (id, name, type, author_id, is_private, created_at, updated_at) values
       (1, 'general', 'TEXT', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
       insert into messages (id, sender_id, room_id, content_encrypted, iv, auth_tag, created_at, updated_at) values
       (X'0102030405060708090a0b0c0d0e0f10', 1, 1, X'1234', X'5678', X'9abc', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
    );

    // 2. Run MessageMentions migration
    await orm.migrator.up({ to: 'Migration20261019130000_MessageMentions' });

    const db = await conn.getNativeClient();

    // 3. Verify existing message has default mentions JSON
    const msg = db
      .prepare(
        "select mentions from messages where id = X'0102030405060708090a0b0c0d0e0f10'",
      )
      .get() as { mentions: string };
    expect(msg).toBeDefined();
    expect(JSON.parse(msg.mentions)).toEqual({
      userIds: [],
      roleIds: [],
      everyone: false,
    });

    // 4. Insert message_mentions row
    await conn.executeDump(
      `insert into message_mentions (message_id, user_id, created_at) values
       (X'0102030405060708090a0b0c0d0e0f10', 2, CURRENT_TIMESTAMP);`,
    );

    let mentionsRows = db
      .prepare('select * from message_mentions')
      .all() as unknown[];
    expect(mentionsRows).toHaveLength(1);

    // 5. Test FK cascade on message delete
    await conn.executeDump(
      "delete from messages where id = X'0102030405060708090a0b0c0d0e0f10';",
    );
    mentionsRows = db
      .prepare('select * from message_mentions')
      .all() as unknown[];
    expect(mentionsRows).toHaveLength(0);

    // 6. Test down migration
    await orm.migrator.down({
      to: 'Migration20261019120000_MentionableRoles',
    });

    const tables = db
      .prepare(
        "select name from sqlite_master where type='table' and name='message_mentions'",
      )
      .all() as unknown[];
    expect(tables).toHaveLength(0);
  });
});
