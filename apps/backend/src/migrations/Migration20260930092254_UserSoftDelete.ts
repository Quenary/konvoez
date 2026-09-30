import { Migration } from '@mikro-orm/migrations';

export class Migration20260930092254_UserSoftDelete extends Migration {
  override name = 'Migration20260930092254';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table \`users\` add column \`deleted_at\` datetime null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`users\` drop column \`deleted_at\`;`);
  }
}
