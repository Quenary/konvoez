import fs from 'fs';
import path from 'path';
import { MikroORM, type EntityManager, type Options } from '@mikro-orm/core';
import { AppService } from '../services/app.service';
import { createMikroOrmConfig } from '../../mikro-orm.config';
import { hmacSha256Hex, unwrapRecoveryHmacKey } from './hmac';
import {
  CHAT_MESSAGE_PURPOSE,
  CHAT_SEARCH_PURPOSE,
  TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE,
  TWO_FACTOR_SECRET_PURPOSE,
} from './master-key.registry';
import { decryptSecretBox, encryptSecretBox } from './secret-box';
import { VAPID_KEY_STORAGE_INFO } from '../utils/master-key.util';
import { extractTrigrams } from '../utils/trigrams.util';

type SqlRow = Record<string, unknown>;

export type RotateCounts = {
  messages: number;
  searchTokens: number;
  twoFactorSecrets: number;
  recoveryKey: boolean;
  vapid: boolean;
};

type PreparedMessage = {
  id: Buffer;
  plain: string;
  next: string;
  tokens: string[];
};

type SqliteDatabase = {
  exec(sql: string): void;
};

const MESSAGE_BATCH = 500;

export async function rotateMasterKey(input: {
  orm: MikroORM;
  oldKey: string;
  newKey: string;
  dryRun: boolean;
  vapidFilePath: string;
}): Promise<RotateCounts> {
  const pending = await input.orm.migrator.getPending();
  if (pending.length > 0) {
    throw new Error('Pending migrations must be applied before rotation');
  }

  const vapidPlain = readVapidPlaintext(input.vapidFilePath, input.oldKey);
  const stagedVapid: { current: { tmp: string; dest: string } | null } = {
    current: null,
  };
  const db = await sqliteDatabase(input.orm);
  db.exec('BEGIN IMMEDIATE');
  let committed = false;

  try {
    const em = input.orm.em;
    const counts = await rewriteProtectedValues(
      em,
      input.oldKey,
      input.newKey,
      input.dryRun,
    );
    counts.vapid = vapidPlain !== null;

    if (input.dryRun) {
      db.exec('ROLLBACK');
      return counts;
    }

    if (vapidPlain !== null) {
      stagedVapid.current = stageVapidFile(
        input.vapidFilePath,
        vapidPlain,
        input.newKey,
      );
    }
    db.exec('COMMIT');
    committed = true;
    replaceVapidFile(stagedVapid.current);
    return counts;
  } catch (error) {
    if (!committed) {
      rollbackQuietly(db);
    }
    if (stagedVapid.current && !renameFailure(error)) {
      fs.rmSync(stagedVapid.current.tmp, { force: true });
    }
    throw error;
  }
}

export async function runRotateMasterKeyCommand(
  argv: readonly string[],
): Promise<number> {
  if (argv.some((arg) => arg !== '--dry-run')) {
    console.error('Unknown argument');
    return 1;
  }

  const oldKey = process.env['OLD_MASTER_KEY'] || null;
  const newKey = process.env['NEW_MASTER_KEY'] || null;
  if (!oldKey || !newKey) {
    console.error('OLD_MASTER_KEY and NEW_MASTER_KEY must be set');
    return 1;
  }

  const orm = await MikroORM.init(
    (await createMikroOrmConfig()) as unknown as Options,
  );
  try {
    const appService = new AppService();
    const counts = await rotateMasterKey({
      orm,
      oldKey,
      newKey,
      dryRun: argv.includes('--dry-run'),
      vapidFilePath: path.join(appService.VAPID_FILE_DIR, 'vapid.json'),
    });
    console.log(
      `messages=${counts.messages} searchTokens=${counts.searchTokens} twoFactorSecrets=${counts.twoFactorSecrets} recoveryKey=${counts.recoveryKey} vapid=${counts.vapid} dryRun=${argv.includes('--dry-run')}`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rotation failed';
    console.error(message);
    return 1;
  } finally {
    await orm.close();
  }
}

async function rewriteProtectedValues(
  em: EntityManager,
  oldKey: string,
  newKey: string,
  dryRun: boolean,
): Promise<RotateCounts> {
  const messages = await rewriteMessages(em, oldKey, newKey, dryRun);
  const secrets = await loadSecrets(em, oldKey, newKey);
  const recoveryWrap = await loadRecoveryWrap(em, oldKey, newKey);
  if (!dryRun) {
    await writeSecrets(em, newKey, secrets);
    await writeRecoveryWrap(em, newKey, recoveryWrap);
  }
  return {
    messages: messages.messages,
    searchTokens: messages.searchTokens,
    twoFactorSecrets: secrets.length,
    recoveryKey: recoveryWrap !== null,
    vapid: false,
  };
}

async function rewriteMessages(
  em: EntityManager,
  oldKey: string,
  newKey: string,
  dryRun: boolean,
): Promise<{ messages: number; searchTokens: number }> {
  const orphans = readCount(
    await query(
      em,
      'select count(*) as count from `message_search_tokens` t left join `messages` m on m.`id` = t.`message_id` where m.`id` is null',
    ),
  );
  if (orphans > 0) {
    throw new Error('Search token does not match a message');
  }

  let messages = 0;
  let searchTokens = 0;
  let after: Buffer | null = null;
  for (;;) {
    const rows = await query(
      em,
      after === null
        ? 'select `id`, `content` from `messages` order by `id` limit ?'
        : 'select `id`, `content` from `messages` where `id` > ? order by `id` limit ?',
      after === null ? [MESSAGE_BATCH] : [after, MESSAGE_BATCH],
    );
    if (rows.length === 0) {
      return { messages, searchTokens };
    }

    const prepared = await prepareMessageBatch(em, oldKey, newKey, rows);
    if (!dryRun) {
      await writeMessages(em, newKey, prepared);
    }
    messages += prepared.length;
    searchTokens += prepared.reduce(
      (sum, message) => sum + message.tokens.length,
      0,
    );
    const last = prepared[prepared.length - 1];
    if (!last) {
      return { messages, searchTokens };
    }
    after = last.id;
  }
}

async function prepareMessageBatch(
  em: EntityManager,
  oldKey: string,
  newKey: string,
  rows: SqlRow[],
): Promise<PreparedMessage[]> {
  const ids = rows.map((row) => asBuffer(row['id']));
  const tokensByMessage = await loadMessageTokens(em, ids);
  return rows.map((row) => {
    const id = asBuffer(row['id']);
    const stored = String(row['content'] ?? '');
    if (!stored.startsWith('v1:')) {
      throw new Error('Message content is not a v1 secret box');
    }
    const plain = decryptSecretBox(oldKey, stored, CHAT_MESSAGE_PURPOSE);
    const expected = extractTrigrams(plain).map((trigram) =>
      hmacSha256Hex(oldKey, CHAT_SEARCH_PURPOSE, trigram),
    );
    const actual = tokensByMessage.get(id.toString('hex')) ?? [];
    if (!sameStrings(expected, actual)) {
      throw new Error('Search tokens do not match the message');
    }
    const next = encryptSecretBox(newKey, plain, CHAT_MESSAGE_PURPOSE);
    if (decryptSecretBox(newKey, next, CHAT_MESSAGE_PURPOSE) !== plain) {
      throw new Error('Rewritten message failed verification');
    }
    const tokens = extractTrigrams(plain).map((trigram) =>
      hmacSha256Hex(newKey, CHAT_SEARCH_PURPOSE, trigram),
    );
    return { id, plain, next, tokens };
  });
}

async function loadMessageTokens(
  em: EntityManager,
  ids: Buffer[],
): Promise<Map<string, string[]>> {
  const tokensByMessage = new Map<string, string[]>();
  if (ids.length === 0) {
    return tokensByMessage;
  }
  const placeholders = ids.map(() => '?').join(', ');
  const tokenRows = await query(
    em,
    `select \`message_id\`, \`token_hash\` from \`message_search_tokens\` where \`message_id\` in (${placeholders})`,
    ids,
  );
  for (const row of tokenRows) {
    const key = asBuffer(row['message_id']).toString('hex');
    const hash = String(row['token_hash']);
    if (!hash.startsWith('v1:')) {
      throw new Error('Search token is not v1');
    }
    const current = tokensByMessage.get(key) ?? [];
    current.push(hash);
    tokensByMessage.set(key, current);
  }
  return tokensByMessage;
}

async function loadSecrets(
  em: EntityManager,
  oldKey: string,
  newKey: string,
): Promise<{ id: number; next: string; plain: string }[]> {
  const rows = await query(
    em,
    'select `id`, `two_factor_secret` from `users` where `two_factor_secret` is not null',
  );
  return rows.map((row) => {
    const stored = String(row['two_factor_secret']);
    if (!stored.startsWith('v1:')) {
      throw new Error('Two-factor secret is not a v1 secret box');
    }
    const plain = decryptSecretBox(oldKey, stored, TWO_FACTOR_SECRET_PURPOSE);
    const next = encryptSecretBox(newKey, plain, TWO_FACTOR_SECRET_PURPOSE);
    if (decryptSecretBox(newKey, next, TWO_FACTOR_SECRET_PURPOSE) !== plain) {
      throw new Error('Rewritten two-factor secret failed verification');
    }
    return { id: Number(row['id']), next, plain };
  });
}

async function loadRecoveryWrap(
  em: EntityManager,
  oldKey: string,
  newKey: string,
): Promise<{ id: number; next: string; plain: string } | null> {
  const rows = await query(
    em,
    'select `id`, `wrapped` from `two_factor_recovery_key`',
  );
  const codeCount = readCount(
    await query(
      em,
      'select count(*) as count from `two_factor_recovery_codes`',
    ),
  );
  if (rows.length === 0) {
    if (codeCount > 0) {
      throw new Error('Two-factor recovery key is missing');
    }
    return null;
  }
  if (rows.length !== 1) {
    throw new Error('Expected a single two-factor recovery key');
  }
  const stored = String(rows[0]?.['wrapped'] ?? '');
  if (!stored.startsWith('v1:')) {
    throw new Error('Two-factor recovery key is not a v1 secret box');
  }
  const key = unwrapRecoveryHmacKey(oldKey, stored);
  const plain = key.toString('base64');
  const next = encryptSecretBox(
    newKey,
    plain,
    TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE,
  );
  if (!unwrapRecoveryHmacKey(newKey, next).equals(key)) {
    throw new Error('Rewritten recovery key failed verification');
  }
  return { id: Number(rows[0]?.['id']), next, plain };
}

async function writeMessages(
  em: EntityManager,
  newKey: string,
  messages: PreparedMessage[],
): Promise<void> {
  for (const message of messages) {
    await query(em, 'update `messages` set `content` = ? where `id` = ?', [
      message.next,
      message.id,
    ]);
    await query(
      em,
      'delete from `message_search_tokens` where `message_id` = ?',
      [message.id],
    );
    for (const token of message.tokens) {
      await query(
        em,
        'insert into `message_search_tokens` (`message_id`, `token_hash`) values (?, ?)',
        [message.id, token],
      );
    }
    const stored = await query(
      em,
      'select `content` from `messages` where `id` = ?',
      [message.id],
    );
    const plain = decryptSecretBox(
      newKey,
      String(stored[0]?.['content'] ?? ''),
      CHAT_MESSAGE_PURPOSE,
    );
    if (plain !== message.plain) {
      throw new Error('Stored message failed verification');
    }
  }
}

async function writeSecrets(
  em: EntityManager,
  newKey: string,
  secrets: { id: number; next: string; plain: string }[],
): Promise<void> {
  for (const secret of secrets) {
    await query(
      em,
      'update `users` set `two_factor_secret` = ? where `id` = ?',
      [secret.next, secret.id],
    );
    const stored = await query(
      em,
      'select `two_factor_secret` from `users` where `id` = ?',
      [secret.id],
    );
    const plain = decryptSecretBox(
      newKey,
      String(stored[0]?.['two_factor_secret'] ?? ''),
      TWO_FACTOR_SECRET_PURPOSE,
    );
    if (plain !== secret.plain) {
      throw new Error('Stored two-factor secret failed verification');
    }
  }
}

async function writeRecoveryWrap(
  em: EntityManager,
  newKey: string,
  recoveryWrap: { id: number; next: string; plain: string } | null,
): Promise<void> {
  if (!recoveryWrap) {
    return;
  }
  await query(
    em,
    'update `two_factor_recovery_key` set `wrapped` = ? where `id` = ?',
    [recoveryWrap.next, recoveryWrap.id],
  );
  const stored = await query(
    em,
    'select `wrapped` from `two_factor_recovery_key` where `id` = ?',
    [recoveryWrap.id],
  );
  const plain = decryptSecretBox(
    newKey,
    String(stored[0]?.['wrapped'] ?? ''),
    TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE,
  );
  if (plain !== recoveryWrap.plain) {
    throw new Error('Stored recovery key failed verification');
  }
}

function readVapidPlaintext(filePath: string, oldKey: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return null;
  }
  if (raw.startsWith('v1:')) {
    return decryptSecretBox(oldKey, raw, VAPID_KEY_STORAGE_INFO);
  }
  const plain = keyPairJson(raw);
  if (!plain) {
    throw new Error('vapid.json is not a v1 secret box');
  }
  return plain;
}

function keyPairJson(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      publicKey?: unknown;
      privateKey?: unknown;
    };
    if (
      typeof parsed.publicKey !== 'string' ||
      typeof parsed.privateKey !== 'string'
    ) {
      return null;
    }
    return JSON.stringify({
      publicKey: parsed.publicKey,
      privateKey: parsed.privateKey,
    });
  } catch {
    return null;
  }
}

function stageVapidFile(
  filePath: string,
  plain: string,
  newKey: string,
): { tmp: string; dest: string } {
  const next = encryptSecretBox(newKey, plain, VAPID_KEY_STORAGE_INFO);
  if (decryptSecretBox(newKey, next, VAPID_KEY_STORAGE_INFO) !== plain) {
    throw new Error('Rewritten VAPID payload failed verification');
  }
  const tmp = `${filePath}.rotate`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, next, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const stored = fs.readFileSync(tmp, 'utf8').trim();
  if (decryptSecretBox(newKey, stored, VAPID_KEY_STORAGE_INFO) !== plain) {
    fs.rmSync(tmp, { force: true });
    throw new Error('Staged VAPID file failed verification');
  }
  return { tmp, dest: filePath };
}

function replaceVapidFile(staged: { tmp: string; dest: string } | null): void {
  if (!staged) {
    return;
  }
  try {
    fs.renameSync(staged.tmp, staged.dest);
  } catch {
    console.error(
      `mv ${shellSingleQuote(staged.tmp)} ${shellSingleQuote(staged.dest)}`,
    );
    throw new RenameFailed();
  }
}

class RenameFailed extends Error {
  constructor() {
    super('Failed to replace vapid.json');
  }
}

function renameFailure(error: unknown): boolean {
  return error instanceof RenameFailed;
}

async function sqliteDatabase(orm: MikroORM): Promise<SqliteDatabase> {
  const conn = orm.em.getConnection() as unknown as {
    getNativeClient: () => Promise<unknown>;
  };
  const client = await conn.getNativeClient();
  if (!isSqliteDatabase(client)) {
    throw new Error('Master key rotation requires SQLite');
  }
  return client;
}

function isSqliteDatabase(client: unknown): client is SqliteDatabase {
  return (
    typeof client === 'object' &&
    client !== null &&
    'exec' in client &&
    typeof client.exec === 'function'
  );
}

function rollbackQuietly(db: SqliteDatabase): void {
  try {
    db.exec('ROLLBACK');
  } catch {
    // The transaction is already closed.
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function query(
  em: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<SqlRow[]> {
  const rows = await em
    .getConnection()
    .execute(sql, params, 'all', em.getTransactionContext());
  return rows as SqlRow[];
}

function readCount(rows: SqlRow[]): number {
  return Number(rows[0]?.['count'] ?? 0);
}

function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  throw new Error('Expected a blob column');
}

function sameStrings(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}
