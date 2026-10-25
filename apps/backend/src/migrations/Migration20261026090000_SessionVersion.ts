import { Migration } from '@mikro-orm/migrations';

export class Migration20261026090000_SessionVersion extends Migration {
  override name = 'Migration20261026090000_SessionVersion';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `users` add column `session_version` integer not null default 0;',
    );
  }

  override down(): void | Promise<void> {
    this.addSql('alter table `users` drop column `session_version`;');
  }
}
