import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('MentionableRoles migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mentionable-roles-mig-test-'),
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

  it('adds mentionable column defaulting to 0 and grants MENTION_EVERYONE idempotently', async () => {
    // 1. Run migrations up to RolesAndRoomAccess
    await orm.migrator.up({ to: 'Migration20261017170127_RolesAndRoomAccess' });

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

    // Add a custom role that already has MODERATE_MESSAGES and MENTION_EVERYONE
    await conn.executeDump(
      `insert into roles (name, color, priority, is_default, permissions, created_at) values
       ('CustomLead', null, 60, 0, '["MODERATE_MESSAGES","MENTION_EVERYONE"]', CURRENT_TIMESTAMP);`,
    );

    // 2. Run MentionableRoles migration
    await orm.migrator.up({ to: 'Migration20261019120000_MentionableRoles' });

    const db = await conn.getNativeClient();

    // 3. Verify mentionable column exists and defaults to 0
    const roles = db
      .prepare('select name, mentionable, permissions from roles')
      .all() as Array<{
      name: string;
      mentionable: number;
      permissions: string;
    }>;

    const userRole = roles.find((r) => r.name === 'User');
    const modRole = roles.find((r) => r.name === 'Moderator');
    const adminRole = roles.find((r) => r.name === 'Admin');
    const customRole = roles.find((r) => r.name === 'CustomLead');

    expect(userRole).toBeDefined();
    expect(userRole?.mentionable).toBe(0);
    const userPerms = JSON.parse(userRole!.permissions);
    expect(userPerms).not.toContain('MENTION_EVERYONE');

    expect(modRole).toBeDefined();
    expect(modRole?.mentionable).toBe(0);
    const modPerms = JSON.parse(modRole!.permissions);
    expect(modPerms).toContain('MENTION_EVERYONE');

    expect(adminRole).toBeDefined();
    expect(adminRole?.mentionable).toBe(0);
    const adminPerms = JSON.parse(adminRole!.permissions);
    expect(adminPerms).toContain('MENTION_EVERYONE');

    // Custom role already had MENTION_EVERYONE, verify no duplicate
    expect(customRole).toBeDefined();
    const customPerms = JSON.parse(customRole!.permissions);
    expect(
      customPerms.filter((p: string) => p === 'MENTION_EVERYONE'),
    ).toHaveLength(1);

    // 4. Test down migration
    await orm.migrator.down({
      to: 'Migration20261017170127_RolesAndRoomAccess',
    });

    const revertedRoles = db
      .prepare('select name, permissions from roles')
      .all() as Array<{ name: string; permissions: string }>;

    const revertedMod = revertedRoles.find((r) => r.name === 'Moderator');
    expect(JSON.parse(revertedMod!.permissions)).not.toContain(
      'MENTION_EVERYONE',
    );

    // Verify mentionable column was removed
    expect(() => {
      db.prepare('select mentionable from roles').all();
    }).toThrow();
  }, 30000);
});
