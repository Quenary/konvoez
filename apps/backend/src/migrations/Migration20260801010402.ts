import { Migration } from '@mikro-orm/migrations';

export class Migration20260801010402 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table \`settings\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime null, \`key\` text check (\`key\` in ('ICE_SERVERS')) not null, \`value\` json not null);`);
    this.addSql(`create unique index \`settings_key_unique\` on \`settings\` (\`key\`);`);

    this.addSql(`create table \`users\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime null, \`username\` text not null, \`password\` text not null, \`fullname\` text not null, \`email\` text not null, \`role\` text check (\`role\` in ('OWNER', 'ADMIN', 'MEMBER')) not null default 'MEMBER', \`avatar\` text null);`);
    this.addSql(`create index \`users_username_index\` on \`users\` (\`username\`);`);
    this.addSql(`create unique index \`users_username_unique\` on \`users\` (\`username\`);`);
    this.addSql(`create index \`users_fullname_index\` on \`users\` (\`fullname\`);`);
    this.addSql(`create index \`users_email_index\` on \`users\` (\`email\`);`);
    this.addSql(`create unique index \`users_email_unique\` on \`users\` (\`email\`);`);

    this.addSql(`create table \`rooms\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime null, \`name\` text not null, \`type\` text check (\`type\` in ('TEXT', 'VOICE')) not null, \`avatar\` text null, \`author_id\` integer not null, constraint \`rooms_author_id_foreign\` foreign key (\`author_id\`) references \`users\` (\`id\`));`);
    this.addSql(`create index \`rooms_name_index\` on \`rooms\` (\`name\`);`);
    this.addSql(`create unique index \`rooms_name_unique\` on \`rooms\` (\`name\`);`);
    this.addSql(`create index \`rooms_author_id_index\` on \`rooms\` (\`author_id\`);`);

    this.addSql(`create table \`messages\` (\`id\` blob not null primary key, \`created_at\` datetime not null, \`updated_at\` datetime null, \`content_encrypted\` blob not null, \`iv\` blob not null, \`auth_tag\` blob not null, \`sender_id\` integer not null, \`recipient_id\` integer null, \`room_id\` integer null, constraint \`messages_sender_id_foreign\` foreign key (\`sender_id\`) references \`users\` (\`id\`), constraint \`messages_recipient_id_foreign\` foreign key (\`recipient_id\`) references \`users\` (\`id\`) on delete set null, constraint \`messages_room_id_foreign\` foreign key (\`room_id\`) references \`rooms\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`messages_sender_id_index\` on \`messages\` (\`sender_id\`);`);
    this.addSql(`create index \`messages_recipient_id_index\` on \`messages\` (\`recipient_id\`);`);
    this.addSql(`create index \`messages_room_id_index\` on \`messages\` (\`room_id\`);`);
    this.addSql(`create index \`messages_room_id_id_index\` on \`messages\` (\`room_id\`, \`id\`);`);
    this.addSql(`create index \`messages_recipient_id_id_index\` on \`messages\` (\`recipient_id\`, \`id\`);`);
    this.addSql(`create index \`messages_sender_id_id_index\` on \`messages\` (\`sender_id\`, \`id\`);`);
    this.addSql(`create index \`messages_sender_id_created_at_index\` on \`messages\` (\`sender_id\`, \`created_at\`);`);
    this.addSql(`create index \`messages_recipient_id_created_at_index\` on \`messages\` (\`recipient_id\`, \`created_at\`);`);
    this.addSql(`create index \`messages_room_id_created_at_index\` on \`messages\` (\`room_id\`, \`created_at\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`settings\`;`);
    this.addSql(`drop table if exists \`users\`;`);
    this.addSql(`drop table if exists \`rooms\`;`);
    this.addSql(`drop table if exists \`messages\`;`);
  }

}
