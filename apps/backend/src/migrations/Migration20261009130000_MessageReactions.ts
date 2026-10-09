import { Migration } from '@mikro-orm/migrations';

export class Migration20261009130000_MessageReactions extends Migration {
  override name = 'Migration20261009130000_MessageReactions';

  override up(): void | Promise<void> {
    this.addSql(
      `create table \`message_reactions\` (\`id\` integer not null primary key autoincrement, \`message_id\` blob not null, \`user_id\` integer not null, \`emoji\` text not null, \`created_at\` datetime not null default CURRENT_TIMESTAMP, constraint \`message_reactions_message_id_foreign\` foreign key (\`message_id\`) references \`messages\` (\`id\`) on update cascade on delete cascade, constraint \`message_reactions_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`,
    );
    this.addSql(
      `create index \`message_reactions_message_id_index\` on \`message_reactions\` (\`message_id\`);`,
    );
    this.addSql(
      `create index \`message_reactions_user_id_index\` on \`message_reactions\` (\`user_id\`);`,
    );
    this.addSql(
      `create index \`message_reactions_message_id_emoji_index\` on \`message_reactions\` (\`message_id\`, \`emoji\`);`,
    );
    this.addSql(
      `create unique index \`message_reactions_message_id_user_id_unique\` on \`message_reactions\` (\`message_id\`, \`user_id\`);`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`message_reactions\`;`);
  }
}
