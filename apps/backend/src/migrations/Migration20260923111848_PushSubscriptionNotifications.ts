import { Migration } from '@mikro-orm/migrations';

export class Migration20260923111848_PushSubscriptionNotifications extends Migration {

  override name = 'Migration20260923111848_PushSubscriptionNotifications';

  override up(): void | Promise<void> {
    this.addSql(`create table \`push_subscriptions\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime null, \`user_id\` integer not null, \`endpoint\` text not null, \`auth\` text not null, \`p256dh\` text not null, \`browser\` text null, \`user_agent\` text null, \`is_active\` integer not null default true, \`last_used_at\` datetime null, constraint \`push_subscriptions_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`push_subscriptions_user_id_index\` on \`push_subscriptions\` (\`user_id\`);`);
    this.addSql(`create index \`push_subscriptions_endpoint_index\` on \`push_subscriptions\` (\`endpoint\`);`);
    this.addSql(`create unique index \`push_subscriptions_endpoint_unique\` on \`push_subscriptions\` (\`endpoint\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`push_subscriptions\`;`);
  }

}
