import { Migration } from '@mikro-orm/migrations';

export class Migration20260922000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      'create table `message_reads` (`id` integer not null primary key autoincrement, `message_id` blob not null, `reader_id` integer not null, `read_at` datetime not null default CURRENT_TIMESTAMP, constraint `message_reads_message_id_foreign` foreign key (`message_id`) references `messages` (`id`) on update cascade on delete cascade, constraint `message_reads_reader_id_foreign` foreign key (`reader_id`) references `users` (`id`) on delete cascade);',
    );
    this.addSql(
      'create index `message_reads_message_id_index` on `message_reads` (`message_id`);',
    );
    this.addSql(
      'create index `message_reads_reader_id_index` on `message_reads` (`reader_id`);',
    );
    this.addSql(
      'create unique index `message_reads_message_id_reader_id_unique` on `message_reads` (`message_id`, `reader_id`);',
    );
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists `message_reads`;');
  }
}
