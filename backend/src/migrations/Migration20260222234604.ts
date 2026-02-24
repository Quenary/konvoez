import { Migration } from '@mikro-orm/migrations';

export class Migration20260222234604 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`messages\` (\`id\` text not null, \`created_at\` datetime not null, \`updated_at\` datetime null, \`content\` text not null, \`sender_id\` integer not null, \`recipient_id\` integer null, \`room_id\` integer null, constraint \`messages_sender_id_foreign\` foreign key(\`sender_id\`) references \`users\`(\`id\`) on update cascade, constraint \`messages_recipient_id_foreign\` foreign key(\`recipient_id\`) references \`users\`(\`id\`) on delete set null on update cascade, constraint \`messages_room_id_foreign\` foreign key(\`room_id\`) references \`rooms\`(\`id\`) on delete set null on update cascade, primary key (\`id\`));`);
    this.addSql(`create index \`messages_sender_id_index\` on \`messages\` (\`sender_id\`);`);
    this.addSql(`create index \`messages_recipient_id_index\` on \`messages\` (\`recipient_id\`);`);
    this.addSql(`create index \`messages_room_id_index\` on \`messages\` (\`room_id\`);`);
    this.addSql(`create index \`messages_room_id_created_at_index\` on \`messages\` (\`room_id\`, \`created_at\`);`);
    this.addSql(`create index \`messages_recipient_id_created_at_index\` on \`messages\` (\`recipient_id\`, \`created_at\`);`);
    this.addSql(`create index \`messages_sender_id_created_at_index\` on \`messages\` (\`sender_id\`, \`created_at\`);`);
  }

}
