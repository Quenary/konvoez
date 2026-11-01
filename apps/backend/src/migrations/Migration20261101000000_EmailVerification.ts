import { Migration } from '@mikro-orm/migrations';

export class Migration20261101000000_EmailVerification extends Migration {
  override name = 'Migration20261101000000_EmailVerification';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `users` add column `email_verified` integer not null default 0;',
    );
    this.addSql('alter table `users` add column `pending_email` text null;');
    this.addSql(
      'create table `email_verification_codes` (`id` integer not null primary key autoincrement, `created_at` datetime not null, `updated_at` datetime null, `user_id` integer not null, `email` text not null, `code_hash` text not null, `attempts` integer not null default 0, `expires_at` datetime not null, `used_at` datetime null, constraint `email_verification_codes_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on update cascade on delete cascade);',
    );
    this.addSql(
      'create index `email_verification_codes_user_id_index` on `email_verification_codes` (`user_id`);',
    );
    this.addSql(
      'create index `email_verification_codes_email_index` on `email_verification_codes` (`email`);',
    );
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists `email_verification_codes`;');
    this.addSql('alter table `users` drop column `email_verified`;');
    this.addSql('alter table `users` drop column `pending_email`;');
  }
}
