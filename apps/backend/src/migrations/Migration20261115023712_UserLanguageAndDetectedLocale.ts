import { Migration } from '@mikro-orm/migrations';

export class Migration20261115023712_UserLanguageAndDetectedLocale extends Migration {
  override name = 'Migration20261115023712_UserLanguageAndDetectedLocale';

  override up(): void | Promise<void> {
    this.addSql(
      'alter table `users` add column `language` text null default null;',
    );
    this.addSql(
      "alter table `users` add column `last_detected_locale` text not null default 'en';",
    );
  }

  override down(): void | Promise<void> {
    this.addSql('alter table `users` drop column `language`;');
    this.addSql('alter table `users` drop column `last_detected_locale`;');
  }
}
