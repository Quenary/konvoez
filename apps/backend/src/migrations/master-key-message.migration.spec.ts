import crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';
import {
  hashRecoveryCode,
  hmacSha256Hex,
  unwrapRecoveryHmacKey,
} from '../shared/master-key/hmac';
import { decryptSecretBox } from '../shared/master-key/secret-box';
import {
  CHAT_MESSAGE_PURPOSE,
  CHAT_SEARCH_PURPOSE,
  TWO_FACTOR_RECOVERY_KEY_INFO,
} from '../shared/master-key/master-key.registry';
import { deriveAes256KeyFromMasterKey } from '../shared/utils/master-key.util';
import { extractTrigrams } from '../shared/utils/trigrams.util';

const { createMikroOrmConfig } = require('../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

type Sqlite = {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[];
    get: (...params: unknown[]) => unknown;
    run: (...params: unknown[]) => void;
  };
};

describe('Master key message migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let orm: MikroORM;
  let previousMasterKey: string | undefined;
  let previousVapidDir: string | undefined;
  const masterKey = Buffer.alloc(32, 11).toString('base64');

  beforeEach(async () => {
    previousMasterKey = process.env['MASTER_KEY'];
    previousVapidDir = process.env['VAPID_FILE_DIR'];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-key-mig-'));
    dbPath = path.join(tmpDir, 'db.sqlite');
    process.env['DB_ENGINE'] = 'sqlite';
    process.env['DB_NAME'] = dbPath;
    process.env['VAPID_FILE_DIR'] = tmpDir;
    delete process.env['MASTER_KEY'];

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

  it('rewrites legacy messages, keeps recovery codes valid, and drops old columns', async () => {
    process.env['MASTER_KEY'] = masterKey;
    await orm.migrator.up({
      to: 'Migration20261101000000_EmailVerification',
    });
    const db = await nativeDb(orm);
    db.prepare(
      `insert into users (username, password, fullname, email, created_at)
       values ('alice', 'hash', 'Alice', 'alice@example.com', CURRENT_TIMESTAMP)`,
    ).run();

    const plain = 'hello search';
    const legacy = encryptLegacy(masterKey, plain);
    const messageId = crypto.randomBytes(16);
    db.prepare(
      `insert into messages (id, created_at, content_encrypted, iv, auth_tag, sender_id, recipient_id)
       values (?, CURRENT_TIMESTAMP, ?, ?, ?, 1, 1)`,
    ).run(messageId, legacy.encrypted, legacy.iv, legacy.authTag);

    const recoveryKey = deriveAes256KeyFromMasterKey(
      masterKey,
      TWO_FACTOR_RECOVERY_KEY_INFO,
    );
    const codeHash = hashRecoveryCode(recoveryKey, 'ABCD');
    db.prepare(
      `insert into two_factor_recovery_codes (user_id, code_hash, created_at)
       values (1, ?, CURRENT_TIMESTAMP)`,
    ).run(codeHash);
    fs.writeFileSync(
      path.join(tmpDir, 'vapid.json'),
      encryptLegacyVapid(masterKey, {
        publicKey: 'legacy-public',
        privateKey: 'legacy-private',
      }),
      'utf8',
    );

    await orm.migrator.up({
      to: 'Migration20261102004712_MasterKeyMessageContent',
    });

    const columns = db.prepare('pragma table_info(messages)').all() as Array<{
      name: string;
      notnull: number;
    }>;
    const names = columns.map((column) => column.name);
    expect(names).toContain('content');
    expect(columns.find((column) => column.name === 'content')?.notnull).toBe(
      1,
    );
    expect(names).not.toContain('content_encrypted');
    expect(names).not.toContain('iv');
    expect(names).not.toContain('auth_tag');

    const stored = db.prepare('select content from messages').get() as {
      content: string;
    };
    expect(
      decryptSecretBox(masterKey, stored.content, CHAT_MESSAGE_PURPOSE),
    ).toBe(plain);

    const token = hmacSha256Hex(
      masterKey,
      CHAT_SEARCH_PURPOSE,
      extractTrigrams(plain)[0] ?? '',
    );
    const found = db
      .prepare(
        'select message_id from message_search_tokens where token_hash = ?',
      )
      .get(token);
    expect(found).toBeDefined();

    const wrapped = db
      .prepare('select wrapped from two_factor_recovery_key')
      .get() as { wrapped: string };
    expect(
      hashRecoveryCode(
        unwrapRecoveryHmacKey(masterKey, wrapped.wrapped),
        'ABCD',
      ),
    ).toBe(codeHash);

    expect(
      decryptSecretBox(
        masterKey,
        fs.readFileSync(path.join(tmpDir, 'vapid.json'), 'utf8').trim(),
        'vapid-key-storage',
      ),
    ).toBe(
      JSON.stringify({
        publicKey: 'legacy-public',
        privateKey: 'legacy-private',
      }),
    );
  });

  it('rolls back when a message cannot be decrypted', async () => {
    process.env['MASTER_KEY'] = masterKey;
    await orm.migrator.up({
      to: 'Migration20261101000000_EmailVerification',
    });
    const db = await nativeDb(orm);
    db.prepare(
      `insert into users (username, password, fullname, email, created_at)
       values ('alice', 'hash', 'Alice', 'alice@example.com', CURRENT_TIMESTAMP)`,
    ).run();
    db.prepare(
      `insert into messages (id, created_at, content_encrypted, iv, auth_tag, sender_id, recipient_id)
       values (?, CURRENT_TIMESTAMP, ?, ?, ?, 1, 1)`,
    ).run(
      crypto.randomBytes(16),
      crypto.randomBytes(8),
      crypto.randomBytes(12),
      crypto.randomBytes(16),
    );

    await expect(
      orm.migrator.up({
        to: 'Migration20261102004712_MasterKeyMessageContent',
      }),
    ).rejects.toThrow(/MASTER_KEY cannot decrypt existing message content/);

    const columns = db.prepare('pragma table_info(messages)').all() as Array<{
      name: string;
    }>;
    const names = columns.map((column) => column.name);
    expect(names).toContain('content_encrypted');
    expect(names).not.toContain('content');
    const tables = db
      .prepare(
        "select name from sqlite_master where type = 'table' and name = 'two_factor_recovery_key'",
      )
      .all();
    expect(tables).toEqual([]);
  });

  it('fails when messages exist and MASTER_KEY is unset', async () => {
    await orm.migrator.up({
      to: 'Migration20261101000000_EmailVerification',
    });
    const db = await nativeDb(orm);
    db.prepare(
      `insert into users (username, password, fullname, email, created_at)
       values ('alice', 'hash', 'Alice', 'alice@example.com', CURRENT_TIMESTAMP)`,
    ).run();
    db.prepare(
      `insert into messages (id, created_at, content_encrypted, iv, auth_tag, sender_id, recipient_id)
       values (?, CURRENT_TIMESTAMP, ?, ?, ?, 1, 1)`,
    ).run(
      crypto.randomBytes(16),
      crypto.randomBytes(8),
      crypto.randomBytes(12),
      crypto.randomBytes(16),
    );

    await expect(
      orm.migrator.up({
        to: 'Migration20261102004712_MasterKeyMessageContent',
      }),
    ).rejects.toThrow(/MASTER_KEY is not set/);

    const columns = db.prepare('pragma table_info(messages)').all() as Array<{
      name: string;
    }>;
    const names = columns.map((column) => column.name);
    expect(names).toContain('content_encrypted');
    expect(names).not.toContain('content');
  });

  it('does not record the migration when MASTER_KEY is unset', async () => {
    await expect(orm.migrator.up()).rejects.toThrow(/MASTER_KEY is not set/);

    const db = await nativeDb(orm);
    const columns = db.prepare('pragma table_info(messages)').all() as Array<{
      name: string;
    }>;
    const names = columns.map((column) => column.name);
    expect(names).toContain('content_encrypted');
    expect(names).not.toContain('content');
    const applied = db
      .prepare('select name from mikro_orm_migrations where name = ?')
      .get('Migration20261102004712_MasterKeyMessageContent');
    expect(applied).toBeUndefined();

    process.env['MASTER_KEY'] = masterKey;
    fs.writeFileSync(
      path.join(tmpDir, 'vapid.json'),
      JSON.stringify({
        publicKey: 'plain-public',
        privateKey: 'plain-private',
      }),
      'utf8',
    );
    await orm.migrator.up();

    const wraps = db
      .prepare('select count(*) as count from two_factor_recovery_key')
      .get() as { count: number };
    expect(Number(wraps.count)).toBe(1);
    expect(
      decryptSecretBox(
        masterKey,
        fs.readFileSync(path.join(tmpDir, 'vapid.json'), 'utf8').trim(),
        'vapid-key-storage',
      ),
    ).toBe(
      JSON.stringify({
        publicKey: 'plain-public',
        privateKey: 'plain-private',
      }),
    );
  });
});

function encryptLegacyVapid(
  masterKey: string,
  keys: { publicKey: string; privateKey: string },
): string {
  const iv = Buffer.alloc(12, 4);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    deriveAes256KeyFromMasterKey(masterKey, 'vapid-key-storage'),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(keys), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function encryptLegacy(
  masterKey: string,
  plain: string,
): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    deriveAes256KeyFromMasterKey(masterKey, 'chat-encryption-key'),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return { encrypted, iv, authTag: cipher.getAuthTag() };
}

async function nativeDb(orm: MikroORM): Promise<Sqlite> {
  const conn = orm.em.getConnection() as unknown as {
    getNativeClient: () => Promise<Sqlite>;
  };
  return conn.getNativeClient();
}
