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
import { EmailVerificationCodeEntitySchema } from './features/auth/email-verification-code.entity';
import { TwoFactorRecoveryCodeEntitySchema } from './features/two-factor/two-factor-recovery-code.entity';
import { TwoFactorRecoveryKeyEntitySchema } from './features/two-factor/two-factor-recovery-key.entity';
import { MessageAttachmentEntitySchema } from './features/attachments/attachments.entity';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { getDefaultSqliteDbPath } from './shared/storage.utils';
import { Migration20261116120000_Baseline } from './migrations/Migration20261116120000_Baseline';
import { Migration20261125001229_AddUserLastSeenAndLastLogin } from './migrations/Migration20261125001229_AddUserLastSeenAndLastLogin';

import { RoleEntitySchema } from './features/roles/roles.entity';

export type DbEngine = 'sqlite' | 'mysql' | 'postgres';

export function resolveDbEngine(rawEngine?: string): DbEngine {
  const normalized = rawEngine?.toLowerCase();
  if (normalized === 'postgres' || normalized === 'postgresql') {
    return 'postgres';
  }
  if (normalized === 'mysql' || normalized === 'mariadb') {
    return 'mysql';
  }
  return 'sqlite';
}

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
      EmailVerificationCodeEntitySchema,
      TwoFactorRecoveryCodeEntitySchema,
      TwoFactorRecoveryKeyEntitySchema,
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
        Migration20261116120000_Baseline,
        Migration20261125001229_AddUserLastSeenAndLastLogin,
      ],
    },
  } satisfies Partial<Options>;

  const engine = resolveDbEngine(process.env.DB_ENGINE);

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
          await conn.executeQuery(
            CompiledQuery.raw('pragma busy_timeout = 5000'),
          );
        },
      });
    }
  }
}

export default createMikroOrmConfig;
