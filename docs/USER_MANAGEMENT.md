# User management

Owner manage other accounts from **Settings → Users** (`/settings/users`). The API is `/api/v1/user-management` and accepts only an `OWNER` session. `ADMIN` and `MEMBER` get `403`. The owner cannot change or delete their own account, or any account with the `OWNER` role.

Profile, directory, and the existing `/api/v1/users` routes are unchanged. `deletedAt` is on the public user object (`null` means the account is active).

## Role

`PATCH /api/v1/user-management/:id` with `{ role }`. Only `ADMIN` or `MEMBER`. Assigning `OWNER` is rejected.

## Logical deletion

`POST /api/v1/user-management/:id/anonymize`.

The row, role, rooms, and messages stay. The account becomes:

- username `deleted-{id}`
- full name `Deleted user`
- email `deleted-{id}@users.invalid`
- no avatar (the stored file is deleted)
- a random password hash
- `deletedAt` set to the first anonymization time (a repeat keeps that timestamp)

Login, cookie refresh, socket connect, and password recovery then fail with the same responses as bad credentials or an unknown email. A still-valid access cookie fails on the next authenticated request.

## Physical deletion

`DELETE /api/v1/user-management/:id` returns `204`.

One transaction removes:

- messages the user sent, direct messages addressed to them, and every message in rooms they created
- `reply_to_id` on remaining messages that pointed at those messages
- those rooms and their avatar files
- the user avatar file and the user row

Invites, recovery codes, push subscriptions, notifications, and read receipts follow the foreign keys. Rooms created by other people stay.

## UI

The menu item is shown only to the owner. A row opens the account and shows all public fields except the password. Delete opens a confirmation. **Full deletion** is off by default (logical deletion); turning it on selects physical deletion. The dialog only returns that choice; the caller performs the request.
