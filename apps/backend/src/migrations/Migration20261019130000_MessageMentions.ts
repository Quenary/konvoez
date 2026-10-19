import { Migration } from '@mikro-orm/migrations';

export class Migration20261019130000_MessageMentions extends Migration {
  override name = 'Migration20261019130000_MessageMentions';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `messages` add column `mentions` json not null default \'{"userIds":[],"roleIds":[],"everyone":false}\';',
    );
    this.addSql(
      'create table `message_mentions` (`id` integer not null primary key autoincrement, `message_id` blob not null, `user_id` integer not null, `created_at` datetime not null default CURRENT_TIMESTAMP, constraint `message_mentions_message_id_foreign` foreign key (`message_id`) references `messages` (`id`) on update cascade on delete cascade, constraint `message_mentions_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete cascade);',
    );
    this.addSql(
      'create unique index `message_mentions_message_id_user_id_unique` on `message_mentions` (`message_id`, `user_id`);',
    );
    this.addSql(
      'create index `message_mentions_user_id_index` on `message_mentions` (`user_id`);',
    );
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists `message_mentions`;');
    this.addSql('alter table `messages` drop column `mentions`;');
  }
}
