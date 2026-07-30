import { defineConfig, Options } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { UserEntitySchema } from './features/users/users.entity';
import { RoomEntitySchema } from './features/rooms/rooms.entity';
import { SettingsEntitySchema } from './features/settings/settings.entity';
import { MessageEntitySchema } from './features/text-rooms/text-rooms.entity';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { Migration20260730002217 } from './migrations/Migration20260730002217';

export type DbEngine = 'sqlite' | 'mysql' | 'postgres';

export async function createMikroOrmConfig() {
  const baseOptions: object = {
    entities: [
      KonvoezBaseEntitySchema,
      UserEntitySchema,
      RoomEntitySchema,
      SettingsEntitySchema,
      MessageEntitySchema,
    ],
    extensions: [Migrator],
    migrations: {
      // Used by the CLI (`migration:create`) which runs with cwd=apps/backend.
      pathTs: './src/migrations',
      // Explicit list is required for the webpack-bundled app (no FS discovery).
      migrationsList: [Migration20260730002217],
    },
  } satisfies Partial<Options>;

  const engine: DbEngine = (process.env.DB_ENGINE as DbEngine) || 'sqlite';

  switch (engine) {
    case 'postgres': {
      return defineConfig({
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
      return defineConfig({
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
      return defineConfig({
        ...baseOptions,
        driver: await import('@mikro-orm/sqlite').then((m) => m.SqliteDriver),
        dbName: process.env.DB_NAME || 'konvoez.sqlite',
      });
    }
  }
}

export default createMikroOrmConfig;
