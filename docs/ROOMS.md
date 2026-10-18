# Rooms

Text and voice rooms are managed via `/api/v1/rooms`. Listing and reading public rooms are available to any authenticated user. Creating, updating, deleting, and uploading a room avatar require `MANAGE_ROOMS` permission (or `isOwner: true`). Users without this permission get `403`.

Room authorship (`author`: `IUserBrief` — id, username, fullname) is stored on create for audit and returned in room DTOs, but does not grant edit/delete rights — only `MANAGE_ROOMS` or `isOwner: true` does.

## Access control & privacy

Rooms can be public or private:

- **Public rooms** (`isPrivate: false`): visible and accessible to all authenticated users.
- **Private rooms** (`isPrivate: true`): access is restricted by `allowedRoles` (`allowedRoleIds: number[]`) and `allowedUsers` (`allowedUserIds: number[]`).
- A user can access a private room if they are `OWNER`, or if their account ID is in `allowedUsers`, or if any of their active roles (assigned or default) is in `allowedRoles`.
- Users without access to a private room cannot see it in room lists, cannot join its voice session, cannot fetch its message history, and cannot send or read messages in it.

## API

| Method   | Path                          | Permission / Role         | Notes                                                                                       |
| -------- | ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/rooms`               | any authenticated         | List all accessible rooms (filters out private rooms user cannot access)                    |
| `GET`    | `/api/v1/rooms/:id`           | room access or `OWNER`    | Single room                                                                                 |
| `POST`   | `/api/v1/rooms`               | `MANAGE_ROOMS` or `OWNER` | Create (`name`, `type`, optional `avatar`, `isPrivate`, `allowedRoleIds`, `allowedUserIds`) |
| `PUT`    | `/api/v1/rooms/:id`           | `MANAGE_ROOMS` or `OWNER` | Update (`name`, optional `avatar`, `isPrivate`, `allowedRoleIds`, `allowedUserIds`)         |
| `DELETE` | `/api/v1/rooms/:id`           | `MANAGE_ROOMS` or `OWNER` | Delete room                                                                                 |
| `POST`   | `/api/v1/rooms/avatar/upload` | `MANAGE_ROOMS` or `OWNER` | Upload avatar file, returns key + URL                                                       |
| `GET`    | `/api/v1/rooms/avatar/stream` | any authenticated         | Stream avatar by `key`                                                                      |

Room names are unique. Duplicate names return `409`.

## UI

In the aside rooms list, the **add** buttons (text / voice) and the per-room context menu (edit / delete) are shown only when the current user has `MANAGE_ROOMS` permission or is `OWNER`. All members can open and use accessible rooms.

The edit dialog allows configuring privacy, allowed roles, and allowed users (when private), and shows read-only **author**, **created**, and **updated** fields.
