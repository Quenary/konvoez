import { Migration } from '@mikro-orm/migrations';

export class Migration20260930120000 extends Migration {
  override name = 'Migration20260930120000';

  override up(): void | Promise<void> {
    this.addSql(`update \`users\` set \`email\` = lower(trim(\`email\`));`);
    this.addSql(
      `update \`invites\` set \`email\` = lower(trim(\`email\`)) where \`email\` is not null;`,
    );
  }
}
