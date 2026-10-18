import { Migration } from '@mikro-orm/migrations';

export class Migration20261017170127_RolesAndRoomAccess extends Migration {
  override name = 'Migration20261017170127_RolesAndRoomAccess';

  override isTransactional(): boolean {
    return false;
  }

  override up(): void | Promise<void> {
    this.addSql(
      `create table \`roles\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null default CURRENT_TIMESTAMP, \`updated_at\` datetime null, \`name\` text not null, \`color\` text null, \`priority\` integer not null default 0, \`is_default\` integer not null default false, \`permissions\` json not null default '[]');`,
    );
    this.addSql(`create index \`roles_name_index\` on \`roles\` (\`name\`);`);
    this.addSql(
      `create unique index \`roles_name_unique\` on \`roles\` (\`name\`);`,
    );

    this.addSql(
      `create table \`user_roles\` (\`user_id\` integer not null, \`role_id\` integer not null, primary key (\`user_id\`, \`role_id\`), constraint \`user_roles_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on update cascade on delete cascade, constraint \`user_roles_role_id_foreign\` foreign key (\`role_id\`) references \`roles\` (\`id\`) on update cascade on delete cascade);`,
    );
    this.addSql(
      `create index \`user_roles_user_id_index\` on \`user_roles\` (\`user_id\`);`,
    );
    this.addSql(
      `create index \`user_roles_role_id_index\` on \`user_roles\` (\`role_id\`);`,
    );

    this.addSql(
      `create table \`room_allowed_roles\` (\`room_id\` integer not null, \`role_id\` integer not null, primary key (\`room_id\`, \`role_id\`), constraint \`room_allowed_roles_room_id_foreign\` foreign key (\`room_id\`) references \`rooms\` (\`id\`) on update cascade on delete cascade, constraint \`room_allowed_roles_role_id_foreign\` foreign key (\`role_id\`) references \`roles\` (\`id\`) on update cascade on delete cascade);`,
    );
    this.addSql(
      `create index \`room_allowed_roles_room_id_index\` on \`room_allowed_roles\` (\`room_id\`);`,
    );
    this.addSql(
      `create index \`room_allowed_roles_role_id_index\` on \`room_allowed_roles\` (\`role_id\`);`,
    );

    this.addSql(
      `create table \`room_allowed_users\` (\`room_id\` integer not null, \`user_id\` integer not null, primary key (\`room_id\`, \`user_id\`), constraint \`room_allowed_users_room_id_foreign\` foreign key (\`room_id\`) references \`rooms\` (\`id\`) on update cascade on delete cascade, constraint \`room_allowed_users_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on update cascade on delete cascade);`,
    );
    this.addSql(
      `create index \`room_allowed_users_room_id_index\` on \`room_allowed_users\` (\`room_id\`);`,
    );
    this.addSql(
      `create index \`room_allowed_users_user_id_index\` on \`room_allowed_users\` (\`user_id\`);`,
    );

    // Seed default 3 roles: User, Moderator, Admin
    this.addSql(
      `insert into \`roles\` (\`name\`, \`color\`, \`priority\`, \`is_default\`, \`permissions\`, \`created_at\`) values ('User', null, 0, 1, '["SEND_MESSAGES","CONNECT_VOICE","USE_ATTACHMENTS"]', CURRENT_TIMESTAMP);`,
    );
    this.addSql(
      `insert into \`roles\` (\`name\`, \`color\`, \`priority\`, \`is_default\`, \`permissions\`, \`created_at\`) values ('Moderator', '#3498db', 50, 0, '["SEND_MESSAGES","CONNECT_VOICE","USE_ATTACHMENTS","MODERATE_MESSAGES","MANAGE_ROOMS"]', CURRENT_TIMESTAMP);`,
    );
    this.addSql(
      `insert into \`roles\` (\`name\`, \`color\`, \`priority\`, \`is_default\`, \`permissions\`, \`created_at\`) values ('Admin', '#e74c3c', 100, 0, '["MANAGE_SETTINGS","MANAGE_INVITES","MANAGE_USERS","MANAGE_ROLES","MANAGE_ROOMS","SEND_MESSAGES","MODERATE_MESSAGES","USE_ATTACHMENTS","CONNECT_VOICE"]', CURRENT_TIMESTAMP);`,
    );

    // Map existing users with role = 'ADMIN' to Admin role
    this.addSql(
      `insert into \`user_roles\` (\`user_id\`, \`role_id\`) select u.\`id\`, r.\`id\` from \`users\` u cross join \`roles\` r where u.\`role\` = 'ADMIN' and r.\`name\` = 'Admin';`,
    );

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(
      `create table \`users__temp_alter\` (\`id\` integer not null primary key autoincrement, \`created_at\` datetime not null, \`updated_at\` datetime null, \`username\` text not null, \`password\` text not null, \`fullname\` text not null, \`email\` text not null, \`is_owner\` integer not null default false, \`avatar\` text null, \`deleted_at\` datetime null);`,
    );
    this.addSql(
      `insert into \`users__temp_alter\` select \`id\`, \`created_at\`, \`updated_at\`, \`username\`, \`password\`, \`fullname\`, \`email\`, (case when \`role\` = 'OWNER' then 1 else 0 end) as \`is_owner\`, \`avatar\`, \`deleted_at\` from \`users\`;`,
    );
    this.addSql(`drop table \`users\`;`);
    this.addSql(`alter table \`users__temp_alter\` rename to \`users\`;`);
    this.addSql(
      `create index \`users_username_index\` on \`users\` (\`username\`);`,
    );
    this.addSql(
      `create unique index \`users_username_unique\` on \`users\` (\`username\`);`,
    );
    this.addSql(
      `create index \`users_fullname_index\` on \`users\` (\`fullname\`);`,
    );
    this.addSql(`create index \`users_email_index\` on \`users\` (\`email\`);`);
    this.addSql(
      `create unique index \`users_email_unique\` on \`users\` (\`email\`);`,
    );
    this.addSql(`pragma foreign_keys = on;`);
    this.addSql('pragma foreign_key_check;');

    this.addSql(
      `alter table \`rooms\` add column \`is_private\` integer not null default false;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`room_allowed_users\`;`);
    this.addSql(`drop table if exists \`room_allowed_roles\`;`);
    this.addSql(`drop table if exists \`user_roles\`;`);
    this.addSql(`drop table if exists \`roles\`;`);

    this.addSql(`alter table \`rooms\` drop column \`is_private\`;`);

    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(
      `create table \`users__temp_alter\` (\`avatar\` text null, \`created_at\` datetime not null, \`deleted_at\` datetime null, \`email\` text not null, \`fullname\` text not null, \`id\` integer not null primary key autoincrement, \`password\` text not null, \`role\` text not null default 'MEMBER', \`updated_at\` datetime null, \`username\` text not null);`,
    );
    this.addSql(
      `insert into \`users__temp_alter\` select \`avatar\`, \`created_at\`, \`deleted_at\`, \`email\`, \`fullname\`, \`id\`, \`password\`, (case when \`is_owner\` = 1 then 'OWNER' else 'MEMBER' end) as \`role\`, \`updated_at\`, \`username\` from \`users\`;`,
    );
    this.addSql(`drop table \`users\`;`);
    this.addSql(`alter table \`users__temp_alter\` rename to \`users\`;`);
    this.addSql(`create index \`users_email_index\` on \`users\` (\`email\`);`);
    this.addSql(
      `create unique index \`users_email_unique\` on \`users\` (\`email\`);`,
    );
    this.addSql(
      `create index \`users_fullname_index\` on \`users\` (\`fullname\`);`,
    );
    this.addSql(
      `create index \`users_username_index\` on \`users\` (\`username\`);`,
    );
    this.addSql(
      `create unique index \`users_username_unique\` on \`users\` (\`username\`);`,
    );
    this.addSql(`pragma foreign_keys = on;`);
    this.addSql('pragma foreign_key_check;');
  }
}
