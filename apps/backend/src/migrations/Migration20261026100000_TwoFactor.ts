import { Migration } from '@mikro-orm/migrations';

export class Migration20261026100000_TwoFactor extends Migration {
  override name = 'Migration20261026100000_TwoFactor';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `users` add column `two_factor_secret` text null;',
    );
    this.addSql(
      'alter table `users` add column `two_factor_enabled_at` datetime null;',
    );
    this.addSql(
      'alter table `users` add column `two_factor_last_step` integer null;',
    );

    this.addSql(
      'create table `two_factor_recovery_codes` (`id` integer not null primary key autoincrement, `created_at` datetime not null, `updated_at` datetime null, `user_id` integer not null, `code_hash` text not null, `used_at` datetime null, constraint `two_factor_recovery_codes_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on update cascade on delete cascade);',
    );
    this.addSql(
      'create index `two_factor_recovery_codes_user_id_index` on `two_factor_recovery_codes` (`user_id`);',
    );
    this.addSql(
      'create index `two_factor_recovery_codes_code_hash_index` on `two_factor_recovery_codes` (`code_hash`);',
    );
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists `two_factor_recovery_codes`;');
    this.addSql('alter table `users` drop column `two_factor_secret`;');
    this.addSql('alter table `users` drop column `two_factor_enabled_at`;');
    this.addSql('alter table `users` drop column `two_factor_last_step`;');
  }
}
