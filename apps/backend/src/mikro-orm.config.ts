import { defineConfig, Options } from '@mikro-orm/core';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { MySqlDriver } from '@mikro-orm/mysql';
import type { SqliteDriver } from '@mikro-orm/sqlite';
import { CompiledQuery, type DatabaseConnection } from 'kysely';
import { Migrator } from '@mikro-orm/migrations';
import { UserEntitySchema } from './features/users/users.entity';
import { RoomEntitySchema } from './features/rooms/rooms.entity';
import { SettingsEntitySchema } from './features/settings/settings.entity';
import {
  MessageEntitySchema,
  MessageMentionEntitySchema,
  MessageReadEntitySchema,
  MessageReactionEntitySchema,
  MessageSearchTokenEntitySchema,
} from './features/text-rooms/text-rooms.entity';
import { InviteEntitySchema } from './features/invites/invites.entity';
import {
  PushSubscriptionEntitySchema,
  UserNotificationSettingsEntitySchema,
} from './features/notifications/notifications.entity';
import { PasswordRecoveryCodeEntitySchema } from './features/auth/password-recovery-code.entity';
import { TwoFactorRecoveryCodeEntitySchema } from './features/two-factor/two-factor-recovery-code.entity';
import { MessageAttachmentEntitySchema } from './features/attachments/attachments.entity';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { Migration20260801010402_InitialSchema } from './migrations/Migration20260801010402_InitialSchema';
import { Migration20260915000000_MessageReplyTo } from './migrations/Migration20260915000000_MessageReplyTo';
import { Migration20260916000000_SettingsKeyPrimaryKey } from './migrations/Migration20260916000000_SettingsKeyPrimaryKey';
import { Migration20260916010000_InvitesAndInviteOnlySignup } from './migrations/Migration20260916010000_InvitesAndInviteOnlySignup';
import { Migration20260917123217_MessageSearchTokens } from './migrations/Migration20260917123217_MessageSearchTokens';
import { getDefaultSqliteDbPath } from './shared/storage.utils';
import { Migration20260922000000_MessageReads } from './migrations/Migration20260922000000_MessageReads';
import { Migration20260923111848_PushSubscriptionNotifications } from './migrations/Migration20260923111848_PushSubscriptionNotifications';
import { Migration20260929152327_PasswordRecoveryCodes } from './migrations/Migration20260929152327_PasswordRecoveryCodes';
import { Migration20260930120000_NormalizeEmails } from './migrations/Migration20260930120000_NormalizeEmails';
import { Migration20260930092254_UserSoftDelete } from './migrations/Migration20260930092254_UserSoftDelete';
import { Migration20261003224050_MessageAttachments } from './migrations/Migration20261003224050_MessageAttachments';
import { Migration20261009130000_MessageReactions } from './migrations/Migration20261009130000_MessageReactions';
import { Migration20261017170127_RolesAndRoomAccess } from './migrations/Migration20261017170127_RolesAndRoomAccess';
import { Migration20261019120000_MentionableRoles } from './migrations/Migration20261019120000_MentionableRoles';
import { Migration20261019130000_MessageMentions } from './migrations/Migration20261019130000_MessageMentions';
import { Migration20261026090000_SessionVersion } from './migrations/Migration20261026090000_SessionVersion';
import { Migration20261026100000_TwoFactor } from './migrations/Migration20261026100000_TwoFactor';
import { Migration20261026172220_UserNotificationSettings } from './migrations/Migration20261026172220_UserNotificationSettings';

import { RoleEntitySchema } from './features/roles/roles.entity';

export type DbEngine = 'sqlite' | 'mysql' | 'postgres';

export async function createMikroOrmConfig() {
  const baseOptions: object = {
    entities: [
      KonvoezBaseEntitySchema,
      UserEntitySchema,
      RoleEntitySchema,
      RoomEntitySchema,
      SettingsEntitySchema,
      MessageEntitySchema,
      MessageMentionEntitySchema,
      MessageSearchTokenEntitySchema,
      InviteEntitySchema,
      MessageReadEntitySchema,
      PushSubscriptionEntitySchema,
      UserNotificationSettingsEntitySchema,
      PasswordRecoveryCodeEntitySchema,
      TwoFactorRecoveryCodeEntitySchema,
      MessageAttachmentEntitySchema,
      MessageReactionEntitySchema,
    ],
    extensions: [Migrator],
    migrations: {
      allOrNothing: false,
      snapshot: false,
      // Used by the CLI (`migration:create`) which runs with cwd=apps/backend.
      pathTs: './src/migrations',
      // Explicit list is required for the webpack-bundled app (no FS discovery).
      // Keep override name = historical DB identity when renaming classes/files.
      migrationsList: [
        Migration20260801010402_InitialSchema,
        Migration20260915000000_MessageReplyTo,
        Migration20260916000000_SettingsKeyPrimaryKey,
        Migration20260916010000_InvitesAndInviteOnlySignup,
        Migration20260917123217_MessageSearchTokens,
        Migration20260922000000_MessageReads,
        Migration20260923111848_PushSubscriptionNotifications,
        Migration20260929152327_PasswordRecoveryCodes,
        Migration20260930120000_NormalizeEmails,
        Migration20260930092254_UserSoftDelete,
        Migration20261003224050_MessageAttachments,
        Migration20261009130000_MessageReactions,
        Migration20261017170127_RolesAndRoomAccess,
        Migration20261019120000_MentionableRoles,
        Migration20261019130000_MessageMentions,
        Migration20261026090000_SessionVersion,
        Migration20261026100000_TwoFactor,
        Migration20261026172220_UserNotificationSettings,
      ],
    },
  } satisfies Partial<Options>;

  const engine: DbEngine = (process.env.DB_ENGINE as DbEngine) || 'sqlite';

  switch (engine) {
    case 'postgres': {
      return defineConfig<PostgreSqlDriver>({
        ...baseOptions,
        driver: await import('@mikro-orm/postgresql').then(
          (m) => m.PostgreSqlDriver,
        ),
        dbName: process.env.DB_NAME || 'konvoez',
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      });
    }
    case 'mysql': {
      return defineConfig<MySqlDriver>({
        ...baseOptions,
        driver: await import('@mikro-orm/mysql').then((m) => m.MySqlDriver),
        dbName: process.env.DB_NAME || 'konvoez',
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
      });
    }
    default: {
      return defineConfig<SqliteDriver>({
        ...baseOptions,
        driver: await import('@mikro-orm/sqlite').then((m) => m.SqliteDriver),
        dbName: process.env.DB_NAME || getDefaultSqliteDbPath(),
        onCreateConnection: async (connection) => {
          const conn = connection as DatabaseConnection;
          await conn.executeQuery(
            CompiledQuery.raw('pragma journal_mode = WAL'),
          );
          await conn.executeQuery(
            CompiledQuery.raw('pragma synchronous = NORMAL'),
          );
        },
      });
    }
  }
}

export default createMikroOrmConfig;
