import { Migration } from '@mikro-orm/migrations';

export class Migration20261116083850_RoomOrder extends Migration {
  override name = 'Migration20261116083850_RoomOrder';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `rooms` add column `order` integer not null default 0;',
    );
    this.addSql('create index `rooms_order_index` on `rooms` (`order`);');
  }

  override down(): void | Promise<void> {
    this.addSql('drop index if exists `rooms_order_index`;');
    this.addSql('alter table `rooms` drop column `order`;');
  }
}
