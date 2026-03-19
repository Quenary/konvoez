import { Migration } from '@mikro-orm/migrations';

export class Migration20260307020201 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`users\` add column \`avatar\` text null;`);
    this.addSql(`create index \`users_avatar_index\` on \`users\` (\`avatar\`);`);
  }

}
