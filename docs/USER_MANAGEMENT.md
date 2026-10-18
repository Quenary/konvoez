# User management

Users with the `MANAGE_USERS` permission or instance `OWNER` manage other accounts from **Settings → Users** (`/settings/users`). The API is `/api/v1/user-management` and requires `MANAGE_USERS` permission (or `isOwner: true`). Other accounts receive `403`. No user (even the owner) can change or delete an account with `isOwner: true`, nor change or delete their own account via user management.

Related user APIs: directory listing is authenticated `GET /api/v1/users` and `GET /api/v1/users/:id`; self-profile is `PATCH /api/v1/profile`, avatar upload `POST /api/v1/profile/avatar/upload`, self-anonymize `POST /api/v1/profile/anonymize`, and self physical delete `DELETE /api/v1/profile`; avatar streaming is `GET /api/v1/users/avatar/stream`. Soft-delete (`deletedAt`) is set only via anonymize below. `deletedAt` is on the public user object (`null` means the account is active).

## Roles

`PATCH /api/v1/user-management/:id` with `{ roleIds: number[] }` updates assigned roles for a user. Requires `MANAGE_ROLES` permission (or `isOwner: true`).

## Logical deletion

`POST /api/v1/user-management/:id/anonymize` (requires `MANAGE_USERS` or `isOwner: true`).

The row, roles, rooms, and messages stay. The account becomes:

- username `deleted-{id}`
- full name `Deleted user`
- email `deleted-{id}@users.invalid`
- no avatar (the stored file is deleted)
- a random password hash
- `deletedAt` set to the first anonymization time (a repeat keeps that timestamp)

Login, cookie refresh, socket connect, and password recovery then fail with the same responses as bad credentials or an unknown email. A still-valid access cookie fails on the next authenticated request.

## Physical deletion

`DELETE /api/v1/user-management/:id` returns `204` (requires `MANAGE_USERS` or `isOwner: true`).

One transaction removes:

- messages the user sent, direct messages addressed to them, and every message in rooms they created
- `reply_to_id` on remaining messages that pointed at those messages
- those rooms and their avatar files
- the user avatar file and the user row

Invites, recovery codes, push subscriptions, notifications, and read receipts follow the foreign keys. Rooms created by other people stay.

## UI

The menu item **Settings → Users** is shown only when the current user has `MANAGE_USERS` permission or is `OWNER`. A row opens the account and shows all public fields except the password. When the user also holds `MANAGE_ROLES`, role checkboxes can be toggled and saved. Delete opens a confirmation. **Full deletion** is off by default (logical deletion); turning it on selects physical deletion. The dialog only returns that choice; the caller performs the request.

## Self-deletion

Non-owner authenticated users can delete their own account from **Settings → Profile**. The `OWNER` account cannot be anonymized or physically deleted (self or via user management) and gets `403`.

- `POST /api/v1/profile/anonymize` — logical deletion (same outcome as owner anonymize of another user)
- `DELETE /api/v1/profile` — physical deletion (same outcome as owner physical delete of another user)

After a successful self-deletion the client logs out and clears the session.
