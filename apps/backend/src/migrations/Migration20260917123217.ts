import { Migration } from '@mikro-orm/migrations';

export class Migration20260917123217 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      'create table `message_search_tokens` (`id` integer not null primary key autoincrement, `message_id` blob not null, `token_hash` text not null, constraint `message_search_tokens_message_id_foreign` foreign key (`message_id`) references `messages` (`id`) on update cascade on delete cascade);',
    );
    this.addSql(
      'create index `message_search_tokens_message_id_index` on `message_search_tokens` (`message_id`);',
    );
    this.addSql(
      'create index `message_search_tokens_token_hash_index` on `message_search_tokens` (`token_hash`);',
    );
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists `message_search_tokens`;');
  }
}
