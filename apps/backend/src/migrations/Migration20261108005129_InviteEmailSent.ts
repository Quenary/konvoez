import { Migration } from '@mikro-orm/migrations';

export class Migration20261108005129_InviteEmailSent extends Migration {
  override name = 'Migration20261108005129_InviteEmailSent';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `invites` add column `email_sent` integer not null default 0;',
    );
    this.addSql(
      'alter table `invites` add column `email_sent_at` datetime null default null;',
    );
  }

  override down(): void | Promise<void> {
    this.addSql('alter table `invites` drop column `email_sent`;');
    this.addSql('alter table `invites` drop column `email_sent_at`;');
  }
}
