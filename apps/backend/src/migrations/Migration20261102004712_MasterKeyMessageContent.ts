import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Migration } from '@mikro-orm/migrations';
import sanitizeHtml from 'sanitize-html';
import { getDefaultDataDir } from '../shared/storage.utils';

const MESSAGE_BATCH = 500;
const CHAT_ENCRYPTION_KEY_INFO = 'chat-encryption-key';
const CHAT_MESSAGE_PURPOSE = 'chat-message';
const CHAT_SEARCH_PURPOSE = 'chat-search';
const TWO_FACTOR_RECOVERY_KEY_INFO = 'two-factor-recovery';
const TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE = 'two-factor-recovery-key';
const VAPID_KEY_STORAGE_INFO = 'vapid-key-storage';

type SqlRow = Record<string, unknown>;

export class Migration20261102004712_MasterKeyMessageContent extends Migration {
  override name = 'Migration20261102004712_MasterKeyMessageContent';

  override async up(): Promise<void> {
    const masterKey = process.env['MASTER_KEY'] || null;
    if (!masterKey) {
      throw new Error('MASTER_KEY is not set');
    }

    rewriteVapidFile(masterKey);

    const messageCount = readCount(
      (await this.execute(
        'select count(*) as count from messages',
      )) as SqlRow[],
    );

    await this.execute(
      "alter table `messages` add column `content` text not null default ''",
    );

    if (messageCount > 0) {
      await this.rewriteMessages(masterKey);
    }

    await this.execute(
      'create table `two_factor_recovery_key` (`id` integer not null primary key, `wrapped` text not null)',
    );
    await this.execute(
      'insert into `two_factor_recovery_key` (`id`, `wrapped`) values (1, ?)',
      [wrapRecoveryKey(masterKey)],
    );

    const missingContent = readCount(
      (await this.execute(
        "select count(*) as count from `messages` where `content` = ''",
      )) as SqlRow[],
    );
    if (missingContent > 0) {
      throw new Error('Message content was not rewritten');
    }

    await this.execute(
      'alter table `messages` drop column `content_encrypted`',
    );
    await this.execute('alter table `messages` drop column `iv`');
    await this.execute('alter table `messages` drop column `auth_tag`');
  }

  private async rewriteMessages(masterKey: string): Promise<void> {
    for (;;) {
      const rows = (await this.execute(
        `select \`id\`, \`content_encrypted\`, \`iv\`, \`auth_tag\` from \`messages\` where \`content\` = '' limit ${MESSAGE_BATCH}`,
      )) as SqlRow[];
      if (rows.length === 0) {
        return;
      }

      for (const row of rows) {
        const id = asBuffer(row['id']);
        const plain = decryptLegacyMessage(
          masterKey,
          asBuffer(row['content_encrypted']),
          asBuffer(row['iv']),
          asBuffer(row['auth_tag']),
        );
        const content = encryptSecretBox(
          masterKey,
          plain,
          CHAT_MESSAGE_PURPOSE,
        );
        await this.execute(
          'update `messages` set `content` = ? where `id` = ?',
          [content, id],
        );
        await this.execute(
          'delete from `message_search_tokens` where `message_id` = ?',
          [id],
        );
        for (const trigram of extractTrigrams(plain)) {
          await this.execute(
            'insert into `message_search_tokens` (`message_id`, `token_hash`) values (?, ?)',
            [id, hmacSha256Hex(masterKey, CHAT_SEARCH_PURPOSE, trigram)],
          );
        }
      }
    }
  }
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

function deriveKey(masterKey: string, info: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(masterKey, 'base64'),
      Buffer.alloc(16, 0),
      Buffer.from(info),
      32,
    ),
  );
}

function decryptLegacyMessage(
  masterKey: string,
  encrypted: Buffer,
  iv: Buffer,
  authTag: Buffer,
): string {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveKey(masterKey, CHAT_ENCRYPTION_KEY_INFO),
      iv,
    );
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('MASTER_KEY cannot decrypt existing message content');
  }
}

function encryptSecretBox(
  masterKey: string,
  plain: string,
  purpose: string,
): string {
  const key = deriveKey(masterKey, purpose);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plain, 'utf8')),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64',
  );
  return `v1:${payload}`;
}

function hmacSha256Hex(
  masterKey: string,
  purpose: string,
  value: string,
): string {
  const hex = crypto
    .createHmac('sha256', deriveKey(masterKey, purpose))
    .update(value, 'utf8')
    .digest('hex');
  return `v1:${hex}`;
}

function rewriteVapidFile(masterKey: string): void {
  const filePath = path.join(
    process.env['VAPID_FILE_DIR'] || getDefaultDataDir(),
    'vapid.json',
  );
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw || raw.startsWith('v1:')) {
    return;
  }

  const plain = readVapidPlaintext(masterKey, raw);
  const next = encryptSecretBox(masterKey, plain, VAPID_KEY_STORAGE_INFO);
  const tmp = `${filePath}.migrate`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, next, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

function readVapidPlaintext(masterKey: string, raw: string): string {
  const json = keyPairJson(raw);
  if (json) {
    return json;
  }
  const legacy = decryptLegacyVapid(masterKey, raw);
  if (!legacy) {
    throw new Error('vapid.json cannot be read');
  }
  return legacy;
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

function decryptLegacyVapid(masterKey: string, value: string): string | null {
  try {
    const raw = Buffer.from(value, 'base64');
    if (raw.length <= 28) {
      return null;
    }
    const key = deriveKey(masterKey, VAPID_KEY_STORAGE_INFO);
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decoded = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
    return keyPairJson(decoded);
  } catch {
    return null;
  }
}

function wrapRecoveryKey(masterKey: string): string {
  const raw = deriveKey(masterKey, TWO_FACTOR_RECOVERY_KEY_INFO);
  return encryptSecretBox(
    masterKey,
    raw.toString('base64'),
    TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE,
  );
}

function htmlToPlainText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTrigrams(htmlContent: string): string[] {
  const normalized = htmlToPlainText(htmlContent)
    .toLowerCase()
    .replace(/\s+/g, '');
  const chars = Array.from(normalized);
  const trigrams = new Set<string>();
  for (let i = 0; i <= chars.length - 3; i++) {
    trigrams.add(chars.slice(i, i + 3).join(''));
  }
  return Array.from(trigrams);
}
