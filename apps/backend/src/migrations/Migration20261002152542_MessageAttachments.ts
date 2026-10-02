import { Migration } from '@mikro-orm/migrations';

export class Migration20261002152542_MessageAttachments extends Migration {
  override name = 'Migration20261002152542';

  override up(): void | Promise<void> {
    this.addSql(
      `create table \`message_attachments\` (\`id\` blob not null primary key, \`created_at\` datetime not null, \`updated_at\` datetime null, \`message_id\` blob null, \`uploader_id\` integer null, \`status\` text not null, \`position\` integer not null default 0, \`kind\` text not null, \`mime\` text not null, \`size\` bigint not null, \`original_name\` text not null, \`storage_key\` text not null, \`thumbnail_key\` text null, \`width\` integer null, \`height\` integer null, constraint \`message_attachments_message_id_foreign\` foreign key (\`message_id\`) references \`messages\` (\`id\`) on update cascade on delete set null, constraint \`message_attachments_uploader_id_foreign\` foreign key (\`uploader_id\`) references \`users\` (\`id\`) on delete set null);`,
    );
    this.addSql(
      `create index \`message_attachments_message_id_index\` on \`message_attachments\` (\`message_id\`);`,
    );
    this.addSql(
      `create index \`message_attachments_uploader_id_index\` on \`message_attachments\` (\`uploader_id\`);`,
    );
    this.addSql(
      `create index \`message_attachments_message_id_position_index\` on \`message_attachments\` (\`message_id\`, \`position\`);`,
    );
    this.addSql(
      `create index \`message_attachments_status_created_at_index\` on \`message_attachments\` (\`status\`, \`created_at\`);`,
    );
    this.addSql(
      `create index \`message_attachments_uploader_id_status_index\` on \`message_attachments\` (\`uploader_id\`, \`status\`);`,
    );

    this.addSql(`alter table \`messages\` add column \`client_id\` blob null;`);
    this.addSql(
      `create unique index \`messages_sender_id_client_id_unique\` on \`messages\` (\`sender_id\`, \`client_id\`);`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`message_attachments\`;`);

    this.addSql(`drop index \`messages_sender_id_client_id_unique\`;`);
    this.addSql(`alter table \`messages\` drop column \`client_id\`;`);
  }
}
