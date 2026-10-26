import { Migration } from '@mikro-orm/migrations';

export class Migration20261026172220_UserNotificationSettings extends Migration {
  override name = 'Migration20261026172220_UserNotificationSettings';

  override up(): void | Promise<void> {
    this.addSql(
      `create table \`user_notification_settings\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime null, \`user_id\` integer not null, \`direct_messages\` integer not null default true, \`direct_calls\` integer not null default true, \`mention_username\` integer not null default true, \`mention_role\` integer not null default true, \`mention_everyone\` integer not null default true, constraint \`user_notification_settings_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`,
    );
    this.addSql(
      `create unique index \`user_notification_settings_user_id_unique\` on \`user_notification_settings\` (\`user_id\`);`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`user_notification_settings\`;`);
  }
}
