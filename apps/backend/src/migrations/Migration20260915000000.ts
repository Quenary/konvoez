import { Migration } from '@mikro-orm/migrations';

export class Migration20260915000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql('alter table `messages` add column `reply_to_id` blob null;');
    this.addSql('create index `messages_reply_to_id_index` on `messages` (`reply_to_id`);');
  }

  override down(): void | Promise<void> {
    this.addSql('drop index if exists `messages_reply_to_id_index`;');
    this.addSql('alter table `messages` drop column `reply_to_id`;');
  }
}
