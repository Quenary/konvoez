import { KnexMigration } from './knex-migration';

export class Migration20261125001229_AddUserLastSeenAndLastLogin extends KnexMigration {
  override name = 'Migration20261125001229_AddUserLastSeenAndLastLogin';

  override up(): void {
    const knex = this.getKnex();
    this.addKnex(
      knex.schema.alterTable('users', (table) => {
        table.dateTime('last_seen_at').nullable().defaultTo(null);
        table.dateTime('last_login_at').nullable().defaultTo(null);
      }),
    );
  }

  override down(): void {
    const knex = this.getKnex();
    // Knex's SQLite alterTable.dropColumn emits PRAGMA table_info() instead of DDL
    // when compiled offline via toSQL(), so use dialect-quoted DROP COLUMN directly.
    this.addKnex(
      knex.raw('ALTER TABLE ?? DROP COLUMN ??', ['users', 'last_seen_at']),
    );
    this.addKnex(
      knex.raw('ALTER TABLE ?? DROP COLUMN ??', ['users', 'last_login_at']),
    );
  }
}
