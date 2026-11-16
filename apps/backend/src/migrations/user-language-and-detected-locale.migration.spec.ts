import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

describe('UserLanguageAndDetectedLocale migration', () => {
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
      path.join(os.tmpdir(), 'user-language-and-detected-locale-mig-test-'),
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

  it('adds language and last_detected_locale columns to users and rolls back cleanly', async () => {
    // 1. Run migrations up to PasswordRecoveryAttempts
    await orm.migrator.up({
      to: 'Migration20261112041029_PasswordRecoveryAttempts',
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

    // Insert an existing user before migration
    await conn.executeDump(
      `insert into users (username, password, fullname, email, is_owner, session_version, created_at) values
       ('alice', 'hashed_pass', 'Alice', 'alice@example.com', 0, 0, CURRENT_TIMESTAMP);`,
    );

    // 2. Run UserLanguageAndDetectedLocale migration
    await orm.migrator.up({
      to: 'Migration20261115023712_UserLanguageAndDetectedLocale',
    });

    const db = await conn.getNativeClient();

    // 3. Verify columns exist on users
    const tableInfo = db.prepare('pragma table_info(users)').all() as Array<{
      name: string;
      dflt_value: unknown;
    }>;
    const languageCol = tableInfo.find((col) => col.name === 'language');
    const lastDetectedLocaleCol = tableInfo.find(
      (col) => col.name === 'last_detected_locale',
    );
    expect(languageCol).toBeDefined();
    expect(lastDetectedLocaleCol).toBeDefined();
    expect(lastDetectedLocaleCol?.dflt_value).toBe("'en'");

    // Verify existing record received default last_detected_locale = 'en' and null language
    const record = db
      .prepare(
        "select language, last_detected_locale from users where username = 'alice'",
      )
      .get() as { language: string | null; last_detected_locale: string };
    expect(record.language).toBeNull();
    expect(record.lastDetectedLocale ?? record.last_detected_locale).toBe('en');

    // 4. Roll back migration
    await orm.migrator.down({
      to: 'Migration20261112041029_PasswordRecoveryAttempts',
    });

    // 5. Verify columns were removed
    const tableInfoAfterDown = db
      .prepare('pragma table_info(users)')
      .all() as Array<{ name: string }>;
    expect(
      tableInfoAfterDown.find((col) => col.name === 'language'),
    ).toBeUndefined();
    expect(
      tableInfoAfterDown.find((col) => col.name === 'last_detected_locale'),
    ).toBeUndefined();
  });
});
