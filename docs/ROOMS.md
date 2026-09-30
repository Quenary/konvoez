# Rooms

Text and voice rooms are managed via `/api/v1/rooms`. Listing and reading are available to any authenticated user. Creating, updating, deleting, and uploading a room avatar require an `OWNER` or `ADMIN` session. `MEMBER` gets `403`.

Room authorship (`author`: `IUserBrief` — id, username, fullname) is stored on create for audit and returned in room DTOs, but does not grant edit/delete rights — only role does.

## API

| Method   | Path                          | Roles             | Notes                                      |
| -------- | ----------------------------- | ----------------- | ------------------------------------------ |
| `GET`    | `/api/v1/rooms`               | any authenticated | List all rooms                             |
| `GET`    | `/api/v1/rooms/:id`           | any authenticated | Single room                                |
| `POST`   | `/api/v1/rooms`               | `OWNER` / `ADMIN` | Create (`name`, `type`, optional `avatar`) |
| `PUT`    | `/api/v1/rooms/:id`           | `OWNER` / `ADMIN` | Update name / avatar                       |
| `DELETE` | `/api/v1/rooms/:id`           | `OWNER` / `ADMIN` | Delete room                                |
| `POST`   | `/api/v1/rooms/avatar/upload` | `OWNER` / `ADMIN` | Upload avatar file, returns key + URL      |
| `GET`    | `/api/v1/rooms/avatar/stream` | any authenticated | Stream avatar by `key`                     |

Room names are unique. Duplicate names return `409`.

## UI

In the aside rooms list, the **add** buttons (text / voice) and the per-room context menu (edit / delete) are shown only when the current user is `OWNER` or `ADMIN`. Members can still open and use rooms.

The edit dialog shows read-only **author**, **created**, and **updated** fields (same layout as the user-management dialog).
