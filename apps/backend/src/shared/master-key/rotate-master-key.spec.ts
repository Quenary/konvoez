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
import { rotateMasterKey } from './rotate-master-key';
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
