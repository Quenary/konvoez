import {
  ALL_PERMISSIONS,
  DEFAULT_MODERATOR_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
  FALLBACK_LANGUAGE,
} from '@konvoez/shared';
import { loadFileSecrets } from '../shared/utils/file-secrets.util';
import { wrapRecoveryHmacKey } from '../shared/master-key/hmac';
import { KnexMigration } from './knex-migration';

export class Migration20261116120000_Baseline extends KnexMigration {
  override name = 'Migration20261116120000_Baseline';

  override up(): void {
    const knex = this.getKnex();

    // 1. Settings
    this.addKnex(
      knex.schema.createTable('settings', (table) => {
        table.string('key', 255).primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table.json('value').notNullable();
      }),
    );

    // 2. Two Factor Recovery Key
    this.addKnex(
      knex.schema.createTable('two_factor_recovery_key', (table) => {
        table.increments('id').primary();
        table.text('wrapped').notNullable();
      }),
    );

    loadFileSecrets();
    const masterKey = process.env['MASTER_KEY'];
    if (!masterKey) {
      throw new Error(
        'MASTER_KEY environment variable is required to run baseline migration',
      );
    }
    const wrappedRecoveryKey = wrapRecoveryHmacKey(masterKey);
    this.addKnex(
      knex('two_factor_recovery_key').insert({
        id: 1,
        wrapped: wrappedRecoveryKey,
      }),
    );

    // 3. Roles
    this.addKnex(
      knex.schema.createTable('roles', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table.string('name', 64).notNullable().unique().index();
        table.string('color', 32).nullable();
        table.integer('priority').notNullable().defaultTo(0);
        table.boolean('is_default').notNullable().defaultTo(false);
        table.boolean('mentionable').notNullable().defaultTo(false);
        table.json('permissions').notNullable().defaultTo([]);
      }),
    );

    // Seed default roles
    const now = knex.fn.now();
    this.addKnex(
      knex('roles').insert([
        {
          name: 'User',
          color: null,
          priority: 0,
          is_default: true,
          mentionable: false,
          permissions: JSON.stringify(DEFAULT_USER_PERMISSIONS),
          created_at: now,
        },
        {
          name: 'Moderator',
          color: '#3498db',
          priority: 50,
          is_default: false,
          mentionable: false,
          permissions: JSON.stringify(DEFAULT_MODERATOR_PERMISSIONS),
          created_at: now,
        },
        {
          name: 'Admin',
          color: '#e74c3c',
          priority: 100,
          is_default: false,
          mentionable: false,
          permissions: JSON.stringify(ALL_PERMISSIONS),
          created_at: now,
        },
      ]),
    );

    // 4. Users
    this.addKnex(
      knex.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table.string('username', 32).notNullable().unique().index();
        table.string('password', 128).notNullable();
        table.integer('session_version').notNullable().defaultTo(0);
        table.string('fullname', 128).notNullable().index();
        table.string('email', 128).notNullable().unique().index();
        table.boolean('email_verified').notNullable().defaultTo(false);
        table.string('pending_email', 128).nullable().defaultTo(null);
        table.boolean('is_owner').notNullable().defaultTo(false);
        table.string('avatar', 512).nullable();
        table.dateTime('deleted_at').nullable();
        table.text('two_factor_secret').nullable();
        table.dateTime('two_factor_enabled_at').nullable();
        table.integer('two_factor_last_step').nullable();
        table.string('language', 16).nullable().defaultTo(null);
        table
          .string('last_detected_locale', 64)
          .notNullable()
          .defaultTo(FALLBACK_LANGUAGE);
      }),
    );

    // 5. User Roles (Pivot)
    this.addKnex(
      knex.schema.createTable('user_roles', (table) => {
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onUpdate('CASCADE')
          .onDelete('CASCADE');
        table
          .integer('role_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('roles')
          .onUpdate('CASCADE')
          .onDelete('CASCADE');
        table.primary(['user_id', 'role_id']);
        table.index('user_id');
        table.index('role_id');
      }),
    );

    // 6. Rooms
    this.addKnex(
      knex.schema.createTable('rooms', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table.string('name', 64).notNullable().unique().index();
        table.string('type', 16).notNullable();
        table.string('avatar', 512).nullable();
        table
          .integer('author_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users');
        table.integer('order').notNullable().defaultTo(0).index();
        table.boolean('is_private').notNullable().defaultTo(false);
        table.index('author_id');
      }),
    );

    // 7. Room Allowed Roles (Pivot)
    this.addKnex(
      knex.schema.createTable('room_allowed_roles', (table) => {
        table
          .integer('room_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('rooms')
          .onUpdate('CASCADE')
          .onDelete('CASCADE');
        table
          .integer('role_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('roles')
          .onUpdate('CASCADE')
          .onDelete('CASCADE');
        table.primary(['room_id', 'role_id']);
        table.index('room_id');
        table.index('role_id');
      }),
    );

    // 8. Room Allowed Users (Pivot)
    this.addKnex(
      knex.schema.createTable('room_allowed_users', (table) => {
        table
          .integer('room_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('rooms')
          .onUpdate('CASCADE')
          .onDelete('CASCADE');
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onUpdate('CASCADE')
          .onDelete('CASCADE');
        table.primary(['room_id', 'user_id']);
        table.index('room_id');
        table.index('user_id');
      }),
    );

    // 9. Messages
    this.addKnex(
      knex.schema.createTable('messages', (table) => {
        table.binary('id', 16).primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table.text('content').notNullable();
        table
          .integer('sender_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .index();
        table
          .integer('recipient_id')
          .unsigned()
          .nullable()
          .references('id')
          .inTable('users')
          .onDelete('SET NULL')
          .index();
        table
          .integer('room_id')
          .unsigned()
          .nullable()
          .references('id')
          .inTable('rooms')
          .onDelete('SET NULL')
          .index();
        table.binary('reply_to_id', 16).nullable().index();
        table.binary('client_id', 16).nullable();
        table
          .json('mentions')
          .notNullable()
          .defaultTo({ userIds: [], roleIds: [], everyone: false });

        table.index(['room_id', 'id']);
        table.index(['recipient_id', 'id']);
        table.index(['sender_id', 'id']);
        table.index(['sender_id', 'created_at']);
        table.index(['recipient_id', 'created_at']);
        table.index(['room_id', 'created_at']);
        table.unique(['sender_id', 'client_id']);
      }),
    );

    // 10. Message Search Tokens
    this.addKnex(
      knex.schema.createTable('message_search_tokens', (table) => {
        table.increments('id').primary();
        table
          .binary('message_id', 16)
          .notNullable()
          .references('id')
          .inTable('messages')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table.string('token_hash', 255).notNullable().index();
      }),
    );

    // 11. Message Reads
    this.addKnex(
      knex.schema.createTable('message_reads', (table) => {
        table.increments('id').primary();
        table
          .binary('message_id', 16)
          .notNullable()
          .references('id')
          .inTable('messages')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table
          .integer('reader_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onDelete('CASCADE')
          .index();
        table.dateTime('read_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['message_id', 'reader_id']);
      }),
    );

    // 12. Message Reactions
    this.addKnex(
      knex.schema.createTable('message_reactions', (table) => {
        table.increments('id').primary();
        table
          .binary('message_id', 16)
          .notNullable()
          .references('id')
          .inTable('messages')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onDelete('CASCADE')
          .index();
        table.string('emoji', 32).notNullable();
        table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
        table.index(['message_id', 'emoji']);
        table.unique(['message_id', 'user_id']);
      }),
    );

    // 13. Message Mentions
    this.addKnex(
      knex.schema.createTable('message_mentions', (table) => {
        table.increments('id').primary();
        table
          .binary('message_id', 16)
          .notNullable()
          .references('id')
          .inTable('messages')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onDelete('CASCADE')
          .index();
        table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['message_id', 'user_id']);
      }),
    );

    // 14. Message Attachments
    this.addKnex(
      knex.schema.createTable('message_attachments', (table) => {
        table.binary('id', 16).primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table
          .binary('message_id', 16)
          .nullable()
          .references('id')
          .inTable('messages')
          .onUpdate('CASCADE')
          .onDelete('SET NULL')
          .index();
        table
          .integer('uploader_id')
          .unsigned()
          .nullable()
          .references('id')
          .inTable('users')
          .onDelete('SET NULL')
          .index();
        table.string('status', 16).notNullable();
        table.integer('position').notNullable().defaultTo(0);
        table.string('kind', 16).notNullable();
        table.string('mime', 255).notNullable();
        table.bigInteger('size').notNullable();
        table.string('original_name', 255).notNullable();
        table.string('storage_key', 512).notNullable();
        table.string('thumbnail_key', 512).nullable();
        table.integer('width').nullable();
        table.integer('height').nullable();
        table.integer('duration_ms').nullable();

        table.index(['message_id', 'position']);
        table.index(['status', 'created_at']);
        table.index(['uploader_id', 'status']);
      }),
    );

    // 15. Push Subscriptions
    this.addKnex(
      knex.schema.createTable('push_subscriptions', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onDelete('CASCADE')
          .index();
        table.string('endpoint', 500).notNullable().unique().index();
        table.string('auth', 512).notNullable();
        table.string('p256dh', 2048).notNullable();
        table.string('browser', 256).nullable();
        table.string('user_agent', 512).nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.dateTime('last_used_at').nullable();
      }),
    );

    // 16. User Notification Settings
    this.addKnex(
      knex.schema.createTable('user_notification_settings', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onDelete('CASCADE')
          .unique();
        table.boolean('direct_messages').notNullable().defaultTo(true);
        table.boolean('direct_calls').notNullable().defaultTo(true);
        table.boolean('replies').notNullable().defaultTo(true);
        table.boolean('reactions').notNullable().defaultTo(true);
        table.boolean('mention_username').notNullable().defaultTo(true);
        table.boolean('mention_role').notNullable().defaultTo(true);
        table.boolean('mention_everyone').notNullable().defaultTo(true);
      }),
    );

    // 17. Password Recovery Codes
    this.addKnex(
      knex.schema.createTable('password_recovery_codes', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table.string('code_hash', 128).notNullable();
        table.integer('attempts').notNullable().defaultTo(0);
        table.dateTime('expires_at').notNullable();
        table.dateTime('used_at').nullable().defaultTo(null);
      }),
    );

    // 18. Email Verification Codes
    this.addKnex(
      knex.schema.createTable('email_verification_codes', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table.string('email', 128).notNullable().index();
        table.string('code_hash', 128).notNullable();
        table.integer('attempts').notNullable().defaultTo(0);
        table.dateTime('expires_at').notNullable();
        table.dateTime('used_at').nullable().defaultTo(null);
      }),
    );

    // 19. Two Factor Recovery Codes
    this.addKnex(
      knex.schema.createTable('two_factor_recovery_codes', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table
          .integer('user_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table.string('code_hash', 128).notNullable().index();
        table.dateTime('used_at').nullable().defaultTo(null);
      }),
    );

    // 20. Invites
    this.addKnex(
      knex.schema.createTable('invites', (table) => {
        table.increments('id').primary();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').nullable();
        table.string('code', 64).notNullable().unique();
        table.string('email', 128).nullable().index();
        table
          .integer('author_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('users')
          .onUpdate('CASCADE')
          .onDelete('CASCADE')
          .index();
        table.dateTime('expires_at').notNullable();
        table.dateTime('used_at').nullable().defaultTo(null);
        table
          .integer('used_by_id')
          .unsigned()
          .nullable()
          .defaultTo(null)
          .references('id')
          .inTable('users')
          .onUpdate('CASCADE')
          .onDelete('SET NULL')
          .index();
        table.dateTime('revoked_at').nullable().defaultTo(null);
        table.boolean('email_sent').notNullable().defaultTo(false);
        table.dateTime('email_sent_at').nullable().defaultTo(null);
      }),
    );
  }

  override down(): void {
    const knex = this.getKnex();

    const tables = [
      'invites',
      'two_factor_recovery_codes',
      'email_verification_codes',
      'password_recovery_codes',
      'user_notification_settings',
      'push_subscriptions',
      'message_attachments',
      'message_mentions',
      'message_reactions',
      'message_reads',
      'message_search_tokens',
      'messages',
      'room_allowed_users',
      'room_allowed_roles',
      'rooms',
      'user_roles',
      'users',
      'roles',
      'two_factor_recovery_key',
      'settings',
    ];

    for (const tableName of tables) {
      this.addKnex(knex.schema.dropTableIfExists(tableName));
    }
  }
}
