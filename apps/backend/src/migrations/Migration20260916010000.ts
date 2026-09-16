import { Migration } from '@mikro-orm/migrations';

export class Migration20260916010000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      'create table `invites` (`id` integer not null primary key autoincrement, `created_at` datetime not null, `updated_at` datetime null, `code` varchar(64) not null, `email` varchar(128) null, `author_id` integer not null, `expires_at` datetime not null, `used_at` datetime null, `used_by_id` integer null, `revoked_at` datetime null, constraint `invites_author_id_foreign` foreign key (`author_id`) references `users` (`id`) on update cascade on delete cascade, constraint `invites_used_by_id_foreign` foreign key (`used_by_id`) references `users` (`id`) on update cascade on delete set null);',
    );
    this.addSql(
      'create unique index `invites_code_unique` on `invites` (`code`);',
    );
    this.addSql('create index `invites_email_index` on `invites` (`email`);');
    this.addSql(
      'create index `invites_author_id_index` on `invites` (`author_id`);',
    );
    this.addSql(
      'create index `invites_used_by_id_index` on `invites` (`used_by_id`);',
    );

    this.addSql(
      "create table `settings_new` (`created_at` datetime not null, `updated_at` datetime null, `key` text check (`key` in ('ICE_SERVERS', 'INVITE_ONLY_SIGN_UP')) not null primary key, `value` json not null);",
    );
    this.addSql(
      "insert into `settings_new` (`created_at`, `updated_at`, `key`, `value`) select `created_at`, `updated_at`, case when `key` = 'INVITE_SIGN_UP_ONLY' then 'INVITE_ONLY_SIGN_UP' else `key` end, `value` from `settings` where `key` in ('ICE_SERVERS', 'INVITE_ONLY_SIGN_UP', 'INVITE_SIGN_UP_ONLY');",
    );
    this.addSql('drop table `settings`;');
    this.addSql('alter table `settings_new` rename to `settings`;');
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists `invites`;');
    this.addSql(
      "create table `settings_old` (`created_at` datetime not null, `updated_at` datetime null, `key` text check (`key` in ('ICE_SERVERS')) not null primary key, `value` json not null);",
    );
    this.addSql(
      "insert into `settings_old` (`created_at`, `updated_at`, `key`, `value`) select `created_at`, `updated_at`, `key`, `value` from `settings` where `key` in ('ICE_SERVERS');",
    );
    this.addSql('drop table `settings`;');
    this.addSql('alter table `settings_old` rename to `settings`;');
  }
}
