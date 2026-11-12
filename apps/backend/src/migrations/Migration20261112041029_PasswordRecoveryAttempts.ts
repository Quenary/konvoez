import { Migration } from '@mikro-orm/migrations';

export class Migration20261112041029_PasswordRecoveryAttempts extends Migration {
  override name = 'Migration20261112041029_PasswordRecoveryAttempts';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `password_recovery_codes` add column `attempts` integer not null default 0;',
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      'alter table `password_recovery_codes` drop column `attempts`;',
    );
  }
}
