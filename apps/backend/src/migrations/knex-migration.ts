import { Migration } from '@mikro-orm/migrations';
import knex, { type Knex } from 'knex';

/**
 * Base migration class providing a declarative Knex SchemaBuilder instance
 * and cross-DBMS compatibility across SQLite, PostgreSQL, and MySQL.
 */
export abstract class KnexMigration extends Migration {
  private knexInstance?: Knex;

  /**
   * Returns a Knex instance configured for the active MikroORM database driver dialect.
   * Compiles SQL queries without establishing an independent database connection.
   */
  getKnex(): Knex {
    if (!this.knexInstance) {
      const platformName =
        this.driver?.getPlatform?.()?.constructor?.name ?? '';
      const driverName =
        (this.config?.get?.('driver') as { name?: string })?.name ?? '';
      const dbEngine = process.env['DB_ENGINE']?.toLowerCase();
      let client = 'better-sqlite3';
      if (
        platformName.includes('PostgreSql') ||
        driverName.includes('PostgreSql') ||
        dbEngine === 'postgres' ||
        dbEngine === 'postgresql'
      ) {
        client = 'pg';
      } else if (
        platformName.includes('MySql') ||
        driverName.includes('MySql') ||
        dbEngine === 'mysql' ||
        dbEngine === 'mariadb'
      ) {
        client = 'mysql2';
      }
      this.knexInstance = knex({
        client,
        useNullAsDefault: true,
        pool: { min: 0, max: 0 },
      });
    }
    return this.knexInstance;
  }

  /**
   * Returns a fresh Knex SchemaBuilder instance for building declarative DDL queries.
   */
  get schema(): Knex.SchemaBuilder {
    return this.getKnex().schema;
  }

  /**
   * Helper to compile and add all SQL statements from a Knex SchemaBuilder, QueryBuilder, or Raw builder.
   * Knex SchemaBuilder.toSQL() returns an array of discrete atomic statement objects,
   * so addKnex passes each statement.sql directly to super.addSql().
   */
  addKnex(builder: Knex.SchemaBuilder | Knex.QueryBuilder | Knex.Raw): void {
    if ('toSQL' in builder) {
      const res = builder.toSQL();
      if (Array.isArray(res)) {
        for (const statement of res) {
          const sql = typeof statement === 'string' ? statement : statement.sql;
          const bindings =
            typeof statement === 'object' &&
            statement !== null &&
            'bindings' in statement &&
            Array.isArray(statement.bindings)
              ? statement.bindings
              : undefined;
          if (bindings && bindings.length > 0) {
            super.addSql(
              this.getKnex()
                .raw(sql, bindings as readonly Knex.RawBinding[])
                .toQuery(),
            );
          } else {
            super.addSql(sql);
          }
        }
      } else {
        super.addSql(builder.toQuery());
      }
    }
  }
}
