import { Migration } from '@mikro-orm/migrations';

export class Migration20260208212617 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`users\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`username\` text not null, \`password\` text not null, \`role\` text check (\`role\` in ('OWNER', 'ADMIN', 'MEMBER')) not null);`);
    this.addSql(`create index \`users_username_index\` on \`users\` (\`username\`);`);
    this.addSql(`create unique index \`users_username_unique\` on \`users\` (\`username\`);`);

    this.addSql(`create table \`rooms\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime not null, \`name\` text not null, \`type\` text check (\`type\` in ('text', 'voice')) not null, \`author_id\` integer null, constraint \`rooms_author_id_foreign\` foreign key(\`author_id\`) references \`users\`(\`id\`) on delete cascade);`);
    this.addSql(`create index \`rooms_name_index\` on \`rooms\` (\`name\`);`);
    this.addSql(`create unique index \`rooms_name_unique\` on \`rooms\` (\`name\`);`);
    this.addSql(`create index \`rooms_author_id_index\` on \`rooms\` (\`author_id\`);`);
  }

}
