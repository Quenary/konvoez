import { Migration } from '@mikro-orm/migrations';

export class Migration20260916000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      "create table `settings_new` (`created_at` datetime not null, `updated_at` datetime null, `key` text check (`key` in ('ICE_SERVERS')) not null primary key, `value` json not null);",
    );
    this.addSql(
      'insert into `settings_new` (`created_at`, `updated_at`, `key`, `value`) select `created_at`, `updated_at`, `key`, `value` from `settings`;',
    );
    this.addSql('drop table `settings`;');
    this.addSql('alter table `settings_new` rename to `settings`;');
  }

  override down(): void | Promise<void> {
    this.addSql(
      "create table `settings_old` (`id` integer not null primary key autoincrement, `created_at` datetime not null, `updated_at` datetime null, `key` text check (`key` in ('ICE_SERVERS')) not null, `value` json not null);",
    );
    this.addSql(
      'create unique index `settings_key_unique` on `settings_old` (`key`);',
    );
    this.addSql(
      'insert into `settings_old` (`created_at`, `updated_at`, `key`, `value`) select `created_at`, `updated_at`, `key`, `value` from `settings`;',
    );
    this.addSql('drop table `settings`;');
    this.addSql('alter table `settings_old` rename to `settings`;');
  }
}
