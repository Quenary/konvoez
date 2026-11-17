import { Logger } from '@nestjs/common';
import type { EntityManager, IMigrator } from '@mikro-orm/core';
import type { MigrationStorage } from '@mikro-orm/migrations';

export const LEGACY_MIGRATION_MARKER = 'Migration20261116083850_RoomOrder';
export const BASELINE_MIGRATION_NAME = 'Migration20261116120000_Baseline';

export interface MigrationOrm {
  migrator: IMigrator;
  em: EntityManager;
}

/**
 * Runs database migrations with automatic legacy stamp support.
 *
 * Handles 3 database states:
 * 1. Fresh Database: No migrations executed yet -> runs baseline & pending migrations normally.
 * 2. Latest Legacy Database: Contains LEGACY_MIGRATION_MARKER but not BASELINE_MIGRATION_NAME ->
 *    clears legacy migration history records and stamps BASELINE_MIGRATION_NAME in a transaction,
 *    then runs pending migrations.
 * 3. Outdated Legacy Database: Non-empty migration history without BASELINE_MIGRATION_NAME and without
 *    LEGACY_MIGRATION_MARKER -> throws an error requiring upgrade to latest previous release.
 */
export async function runMigrations(orm: MigrationOrm): Promise<void> {
  const logger = new Logger('MigrationRunner');
  const storage = (
    orm.migrator as unknown as { getStorage(): MigrationStorage }
  ).getStorage();

  const executed = await storage.executed();
  const hasBaseline = executed.includes(BASELINE_MIGRATION_NAME);
  const hasLegacyMarker =
    executed.includes(LEGACY_MIGRATION_MARKER) ||
    executed.some((name) => name.startsWith('Migration20261116083850'));

  if (!hasBaseline && executed.length > 0) {
    if (!hasLegacyMarker) {
      throw new Error(
        `Database schema is outdated. Found ${executed.length} legacy migration(s), but missing the required release marker '${LEGACY_MIGRATION_MARKER}'. Please upgrade to the latest previous release before upgrading to this version.`,
      );
    }

    logger.log(
      `Legacy database detected with marker '${LEGACY_MIGRATION_MARKER}'. Stamping baseline migration '${BASELINE_MIGRATION_NAME}'...`,
    );

    const em = orm.em.fork();
    await em.transactional(async (txEm) => {
      const { entity, schemaName } = storage.getTableName();
      const ctx = txEm.getTransactionContext();
      await txEm
        .getDriver()
        .nativeDelete(entity, {}, { ctx, schema: schemaName });
      await storage.logMigration({ name: BASELINE_MIGRATION_NAME }, ctx);
    });

    logger.log(
      `Successfully stamped baseline migration '${BASELINE_MIGRATION_NAME}'.`,
    );
  }

  await orm.migrator.up();
}
