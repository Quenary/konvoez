import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MikroORM, type Options } from '@mikro-orm/core';
import { hashRecoveryCode, hmacSha256Hex, unwrapRecoveryHmacKey } from './hmac';
import {
  CHAT_MESSAGE_PURPOSE,
  CHAT_SEARCH_PURPOSE,
  TWO_FACTOR_SECRET_PURPOSE,
} from './master-key.registry';
import {
  asBuffer,
  getKnexForOrm,
  rotateMasterKey,
  runRotateMasterKeyCommand,
} from './rotate-master-key';
import { decryptSecretBox, encryptSecretBox } from './secret-box';
import { extractTrigrams } from '../utils/trigrams.util';
import { VAPID_KEY_STORAGE_INFO } from '../utils/master-key.util';

const { createMikroOrmConfig } = require('../../mikro-orm.config') as {
  createMikroOrmConfig: () => Promise<Options>;
};

type Sqlite = {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[];
    get: (...params: unknown[]) => unknown;
    run: (...params: unknown[]) => void;
  };
};

describe('rotateMasterKey', () => {
  let tmpDir: string;
  let dbPath: string;
  let vapidPath: string;
  let orm: MikroORM;
  let previous: Record<string, string | undefined>;
  const oldKey = Buffer.alloc(32, 4).toString('base64');
  const newKey = Buffer.alloc(32, 9).toString('base64');
  const plain = 'hello rotation';

  beforeEach(async () => {
    previous = {
      MASTER_KEY: process.env['MASTER_KEY'],
      DB_ENGINE: process.env['DB_ENGINE'],
      DB_NAME: process.env['DB_NAME'],
      VAPID_FILE_DIR: process.env['VAPID_FILE_DIR'],
    };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-master-key-'));
    dbPath = path.join(tmpDir, 'db.sqlite');
    vapidPath = path.join(tmpDir, 'vapid.json');
    process.env['DB_ENGINE'] = 'sqlite';
    process.env['DB_NAME'] = dbPath;
    process.env['VAPID_FILE_DIR'] = tmpDir;
    process.env['MASTER_KEY'] = oldKey;

    orm = await MikroORM.init(await createMikroOrmConfig());
    await orm.migrator.up();
    await seed(orm, oldKey, vapidPath, plain);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (orm) {
      await orm.close(true);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    restoreEnv(previous);
  });

  it('leaves the database and vapid file unchanged on dry-run', async () => {
    const before = fs.readFileSync(vapidPath, 'utf8');
    const db = await nativeDb(orm);
    const exec = jest.spyOn(db, 'exec');
    const contentBefore = (
      db.prepare('select content from messages').get() as { content: string }
    ).content;

    const counts = await rotateMasterKey({
      orm,
      oldKey,
      newKey,
      dryRun: true,
      vapidFilePath: vapidPath,
    });

    expect(exec).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE');
    expect(exec).toHaveBeenCalledWith('ROLLBACK');

    expect(counts.messages).toBe(1);
    expect(counts.vapid).toBe(true);
    expect(counts.recoveryKey).toBe(true);
    expect(fs.readFileSync(vapidPath, 'utf8')).toBe(before);
    expect(
      (db.prepare('select content from messages').get() as { content: string })
        .content,
    ).toBe(contentBefore);
    expect(fs.existsSync(`${vapidPath}.rotate`)).toBe(false);
  });

  it('rewrites v1 values and keeps recovery codes valid', async () => {
    await rotateMasterKey({
      orm,
      oldKey,
      newKey,
      dryRun: false,
      vapidFilePath: vapidPath,
    });

    const db = await nativeDb(orm);
    const stored = db.prepare('select content from messages').get() as {
      content: string;
    };
    expect(decryptSecretBox(newKey, stored.content, CHAT_MESSAGE_PURPOSE)).toBe(
      plain,
    );
    expect(() =>
      decryptSecretBox(oldKey, stored.content, CHAT_MESSAGE_PURPOSE),
    ).toThrow();

    const token = hmacSha256Hex(
      newKey,
      CHAT_SEARCH_PURPOSE,
      extractTrigrams(plain)[0] ?? '',
    );
    expect(
      db
        .prepare(
          'select token_hash from message_search_tokens where token_hash = ?',
        )
        .get(token),
    ).toBeDefined();

    const secret = db.prepare('select two_factor_secret from users').get() as {
      two_factor_secret: string;
    };
    expect(
      decryptSecretBox(
        newKey,
        secret.two_factor_secret,
        TWO_FACTOR_SECRET_PURPOSE,
      ),
    ).toBe('totp-seed');

    const wrapped = db
      .prepare('select wrapped from two_factor_recovery_key')
      .get() as { wrapped: string };
    const code = db
      .prepare('select code_hash from two_factor_recovery_codes')
      .get() as { code_hash: string };
    expect(
      hashRecoveryCode(unwrapRecoveryHmacKey(newKey, wrapped.wrapped), 'ABCD'),
    ).toBe(code.code_hash);

    const vapid = JSON.parse(
      decryptSecretBox(
        newKey,
        fs.readFileSync(vapidPath, 'utf8').trim(),
        VAPID_KEY_STORAGE_INFO,
      ),
    );
    expect(vapid).toEqual({ publicKey: 'pub', privateKey: 'priv' });
  });

  it('re-encrypts a plaintext vapid.json', async () => {
    fs.writeFileSync(
      vapidPath,
      JSON.stringify({ publicKey: 'pub', privateKey: 'priv' }),
      'utf8',
    );

    await rotateMasterKey({
      orm,
      oldKey,
      newKey,
      dryRun: false,
      vapidFilePath: vapidPath,
    });

    const stored = fs.readFileSync(vapidPath, 'utf8').trim();
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptSecretBox(newKey, stored, VAPID_KEY_STORAGE_INFO)).toBe(
      JSON.stringify({ publicKey: 'pub', privateKey: 'priv' }),
    );
  });

  it('stops before the transaction when vapid.json is not v1', async () => {
    const db = await nativeDb(orm);
    const before = (
      db.prepare('select content from messages').get() as { content: string }
    ).content;
    fs.writeFileSync(vapidPath, 'not-a-secret-box', 'utf8');

    await expect(
      rotateMasterKey({
        orm,
        oldKey,
        newKey,
        dryRun: false,
        vapidFilePath: vapidPath,
      }),
    ).rejects.toThrow(/vapid.json is not a v1 secret box/);

    expect(
      (db.prepare('select content from messages').get() as { content: string })
        .content,
    ).toBe(before);
  });

  it('rolls back when a stored value cannot be decrypted', async () => {
    const db = await nativeDb(orm);
    const before = (
      db.prepare('select content from messages').get() as { content: string }
    ).content;
    db.prepare('update messages set content = ?').run('v1:broken');

    await expect(
      rotateMasterKey({
        orm,
        oldKey,
        newKey,
        dryRun: false,
        vapidFilePath: vapidPath,
      }),
    ).rejects.toThrow();

    expect(
      (db.prepare('select content from messages').get() as { content: string })
        .content,
    ).toBe('v1:broken');
    expect(before).not.toBe('v1:broken');
    expect(fs.readFileSync(vapidPath, 'utf8').startsWith('v1:')).toBe(true);
    expect(
      decryptSecretBox(
        oldKey,
        fs.readFileSync(vapidPath, 'utf8').trim(),
        VAPID_KEY_STORAGE_INFO,
      ),
    ).toContain('pub');
  });

  it('keeps the staged vapid file when rename fails after commit', async () => {
    jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed');
    });
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      rotateMasterKey({
        orm,
        oldKey,
        newKey,
        dryRun: false,
        vapidFilePath: vapidPath,
      }),
    ).rejects.toThrow(/Failed to replace vapid.json/);

    expect(fs.existsSync(`${vapidPath}.rotate`)).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      `mv '${vapidPath}.rotate' '${vapidPath}'`,
    );
    const db = await nativeDb(orm);
    const stored = db.prepare('select content from messages').get() as {
      content: string;
    };
    expect(decryptSecretBox(newKey, stored.content, CHAT_MESSAGE_PURPOSE)).toBe(
      plain,
    );
  });

  it('uses standard transactional isolation (fork().begin / fork().commit / fork().rollback) when client is not SQLite', async () => {
    const forkedEm = orm.em.fork();
    const conn = forkedEm.getConnection() as unknown as {
      getNativeClient: () => Promise<unknown>;
    };
    // Mock getNativeClient to return a non-sqlite client (pool without .exec)
    jest.spyOn(conn, 'getNativeClient').mockResolvedValue({});
    const forkSpy = jest.spyOn(orm.em, 'fork').mockReturnValue(forkedEm);

    const beginSpy = jest.spyOn(forkedEm, 'begin').mockResolvedValue(undefined);
    const commitSpy = jest
      .spyOn(forkedEm, 'commit')
      .mockResolvedValue(undefined);
    const rollbackSpy = jest
      .spyOn(forkedEm, 'rollback')
      .mockResolvedValue(undefined);

    // Test dryRun: should begin and rollback
    const counts = await rotateMasterKey({
      orm,
      oldKey,
      newKey,
      dryRun: true,
      vapidFilePath: vapidPath,
    });

    expect(forkSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).not.toHaveBeenCalled();
    expect(counts.messages).toBe(1);

    // Test full rotation: should begin and commit
    forkSpy.mockClear();
    beginSpy.mockClear();
    rollbackSpy.mockClear();
    commitSpy.mockClear();

    await rotateMasterKey({
      orm,
      oldKey,
      newKey,
      dryRun: false,
      vapidFilePath: vapidPath,
    });

    expect(forkSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).not.toHaveBeenCalled();
  });

  it('rolls back via fork().rollback when client is not SQLite and an error occurs', async () => {
    const db = await nativeDb(orm);
    db.prepare('update messages set content = ?').run('v1:broken');

    const forkedEm = orm.em.fork();
    const conn = forkedEm.getConnection() as unknown as {
      getNativeClient: () => Promise<unknown>;
    };
    jest.spyOn(conn, 'getNativeClient').mockResolvedValue({});
    const forkSpy = jest.spyOn(orm.em, 'fork').mockReturnValue(forkedEm);

    const beginSpy = jest.spyOn(forkedEm, 'begin').mockResolvedValue(undefined);
    const rollbackSpy = jest
      .spyOn(forkedEm, 'rollback')
      .mockResolvedValue(undefined);

    await expect(
      rotateMasterKey({
        orm,
        oldKey,
        newKey,
        dryRun: false,
        vapidFilePath: vapidPath,
      }),
    ).rejects.toThrow();

    expect(forkSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves correct Knex dialect for PostgreSQL and MySQL', () => {
    process.env['DB_ENGINE'] = 'postgres';
    const knexPg = getKnexForOrm(orm);
    expect(knexPg.client.dialect).toBe('postgresql');
    const pgSql = knexPg('messages').select('id').toSQL().sql;
    expect(pgSql).toContain('"messages"');

    process.env['DB_ENGINE'] = 'postgresql';
    const knexPg2 = getKnexForOrm(orm);
    expect(knexPg2.client.dialect).toBe('postgresql');

    process.env['DB_ENGINE'] = 'mysql';
    const knexMySql = getKnexForOrm(orm);
    expect(knexMySql.client.dialect).toBe('mysql');
    const mySql = knexMySql('messages').select('id').toSQL().sql;
    expect(mySql).toContain('`messages`');

    process.env['DB_ENGINE'] = 'mariadb';
    const knexMaria = getKnexForOrm(orm);
    expect(knexMaria.client.dialect).toBe('mysql');

    process.env['DB_ENGINE'] = 'sqlite';
    const knexSqlite = getKnexForOrm(orm);
    expect(knexSqlite.client.dialect).toBe('sqlite3');
  });

  it('resolves dialect from ORM platform name when DB_ENGINE is not set', () => {
    delete process.env['DB_ENGINE'];
    const pgOrm = {
      em: {
        getPlatform: () => ({ constructor: { name: 'PostgreSqlPlatform' } }),
      },
      config: { get: () => undefined },
    } as unknown as MikroORM;
    expect(getKnexForOrm(pgOrm).client.dialect).toBe('postgresql');

    const myOrm = {
      em: {
        getPlatform: () => ({ constructor: { name: 'MySqlPlatform' } }),
      },
      config: { get: () => undefined },
    } as unknown as MikroORM;
    expect(getKnexForOrm(myOrm).client.dialect).toBe('mysql');
  });

  it('asBuffer converts various binary representations into a Buffer', () => {
    const raw = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');

    expect(asBuffer(raw).equals(raw)).toBe(true);
    expect(asBuffer(new Uint8Array(raw)).equals(raw)).toBe(true);
    expect(asBuffer('\\x' + raw.toString('hex')).equals(raw)).toBe(true);
    expect(asBuffer(raw.toString('hex')).equals(raw)).toBe(true);
    expect(asBuffer(raw.toString('latin1')).equals(raw)).toBe(true);

    expect(() => asBuffer(12345)).toThrow(/Expected a blob column/);
    expect(() => asBuffer('invalid-length')).toThrow(/Expected a blob column/);
  });

  it('runRotateMasterKeyCommand loads keys from OLD_MASTER_KEY_FILE and NEW_MASTER_KEY_FILE', async () => {
    const oldKeyFile = path.join(tmpDir, 'old-key.txt');
    const newKeyFile = path.join(tmpDir, 'new-key.txt');
    fs.writeFileSync(oldKeyFile, oldKey + '\n');
    fs.writeFileSync(newKeyFile, newKey + '\n');

    delete process.env['OLD_MASTER_KEY'];
    delete process.env['NEW_MASTER_KEY'];
    process.env['OLD_MASTER_KEY_FILE'] = oldKeyFile;
    process.env['NEW_MASTER_KEY_FILE'] = newKeyFile;

    const exitCode = await runRotateMasterKeyCommand(['--dry-run']);
    expect(exitCode).toBe(0);
  });
});

async function seed(
  orm: MikroORM,
  oldKey: string,
  vapidPath: string,
  plain: string,
): Promise<void> {
  const db = await nativeDb(orm);
  const secret = encryptSecretBox(
    oldKey,
    'totp-seed',
    TWO_FACTOR_SECRET_PURPOSE,
  );
  db.prepare(
    `insert into users (username, password, fullname, email, created_at, two_factor_secret)
     values ('alice', 'hash', 'Alice', 'alice@example.com', CURRENT_TIMESTAMP, ?)`,
  ).run(secret);

  const wrapped = db
    .prepare('select wrapped from two_factor_recovery_key')
    .get() as { wrapped: string };
  db.prepare(
    `insert into two_factor_recovery_codes (user_id, code_hash, created_at)
     values (1, ?, CURRENT_TIMESTAMP)`,
  ).run(
    hashRecoveryCode(unwrapRecoveryHmacKey(oldKey, wrapped.wrapped), 'ABCD'),
  );

  const messageId = crypto.randomBytes(16);
  db.prepare(
    `insert into messages (id, created_at, content, sender_id, recipient_id)
     values (?, CURRENT_TIMESTAMP, ?, 1, 1)`,
  ).run(messageId, encryptSecretBox(oldKey, plain, CHAT_MESSAGE_PURPOSE));
  for (const trigram of extractTrigrams(plain)) {
    db.prepare(
      `insert into message_search_tokens (message_id, token_hash) values (?, ?)`,
    ).run(messageId, hmacSha256Hex(oldKey, CHAT_SEARCH_PURPOSE, trigram));
  }

  fs.writeFileSync(
    vapidPath,
    encryptSecretBox(
      oldKey,
      JSON.stringify({ publicKey: 'pub', privateKey: 'priv' }),
      VAPID_KEY_STORAGE_INFO,
    ),
    'utf8',
  );
}

async function nativeDb(orm: MikroORM): Promise<Sqlite> {
  const conn = orm.em.getConnection() as unknown as {
    getNativeClient: () => Promise<Sqlite>;
  };
  return conn.getNativeClient();
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
