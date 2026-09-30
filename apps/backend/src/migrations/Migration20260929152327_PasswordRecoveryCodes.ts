import { Migration } from '@mikro-orm/migrations';

export class Migration20260929152327_PasswordRecoveryCodes extends Migration {
  override name = 'Migration20260929152327';

  override up(): void | Promise<void> {
    this.addSql(
      `create table \`password_recovery_codes\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime null, \`user_id\` integer not null, \`code_hash\` text not null, \`expires_at\` datetime not null, \`used_at\` datetime null, constraint \`password_recovery_codes_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on update cascade on delete cascade);`,
    );
    this.addSql(
      `create index \`password_recovery_codes_user_id_index\` on \`password_recovery_codes\` (\`user_id\`);`,
    );

    // Drop SQLite CHECK on settings.key so new ESettingKey values can be inserted by initSettings.
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(
      `create table \`settings__temp_alter\` (\`key\` text not null primary key, \`created_at\` datetime not null, \`updated_at\` datetime null, \`value\` json not null);`,
    );
    this.addSql(
      `insert into \`settings__temp_alter\` select \`key\`, \`created_at\`, \`updated_at\`, \`value\` from \`settings\`;`,
    );
    this.addSql(`drop table \`settings\`;`);
    this.addSql(`alter table \`settings__temp_alter\` rename to \`settings\`;`);
    this.addSql(`pragma foreign_keys = on;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`password_recovery_codes\`;`);

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(
      `create table \`settings__temp_alter\` (\`created_at\` datetime not null, \`updated_at\` datetime null, \`key\` text check (\`key\` in ('ICE_SERVERS', 'INVITE_ONLY_SIGN_UP')) not null primary key, \`value\` json not null);`,
    );
    this.addSql(
      `insert into \`settings__temp_alter\` select \`created_at\`, \`updated_at\`, \`key\`, \`value\` from \`settings\` where \`key\` in ('ICE_SERVERS', 'INVITE_ONLY_SIGN_UP');`,
    );
    this.addSql(`drop table \`settings\`;`);
    this.addSql(`alter table \`settings__temp_alter\` rename to \`settings\`;`);
    this.addSql(`pragma foreign_keys = on;`);
  }
}
