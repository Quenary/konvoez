import { Migration } from '@mikro-orm/migrations';

export class Migration20261019120000_MentionableRoles extends Migration {
  override name = 'Migration20261019120000_MentionableRoles';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `roles` add column `mentionable` integer not null default 0;',
    );
    this.addSql(
      "update `roles` set `permissions` = json_insert(`permissions`, '$[#]', 'MENTION_EVERYONE') where exists (select 1 from json_each(`roles`.`permissions`) where value = 'MODERATE_MESSAGES') and not exists (select 1 from json_each(`roles`.`permissions`) where value = 'MENTION_EVERYONE');",
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      "update `roles` set `permissions` = (select json_remove(`roles`.`permissions`, '$[' || key || ']') from json_each(`roles`.`permissions`) where value = 'MENTION_EVERYONE') where exists (select 1 from json_each(`roles`.`permissions`) where value = 'MENTION_EVERYONE');",
    );
    this.addSql('alter table `roles` drop column `mentionable`;');
  }
}
