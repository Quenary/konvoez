import { Migration } from '@mikro-orm/migrations';

export class Migration20261027192655_UserNotificationSettingsReplies extends Migration {
  override name = 'Migration20261027192655_UserNotificationSettingsReplies';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `user_notification_settings` add column `replies` integer not null default true;',
    );
    this.addSql(
      'alter table `user_notification_settings` add column `reactions` integer not null default true;',
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      'alter table `user_notification_settings` drop column `reactions`;',
    );
    this.addSql(
      'alter table `user_notification_settings` drop column `replies`;',
    );
  }
}
