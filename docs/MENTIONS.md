# Mentions

Konvoez supports user, role, and everyone `@mentions` across text room messages. Mentions are scoped strictly to text rooms (direct messages do not use mention notifications or tokens).

## Mention Types & Canonical Tokens

Mentions are represented in rich text content using Discord-compatible canonical tokens:

| Type     | Syntax       | Description                                  | Example     |
| -------- | ------------ | -------------------------------------------- | ----------- |
| User     | `<@userId>`  | Mentions a specific user by numeric ID       | `<@42>`     |
| Role     | `<@&roleId>` | Mentions all members assigned a role         | `<@&3>`     |
| Everyone | `@everyone`  | Mentions all members with access to the room | `@everyone` |

### Token Parsing & Code Blocks

- Canonical tokens are parsed on both client and server via `@konvoez/shared` (`splitMentionSegments`, `parseMentionTokens`).
- Mentions enclosed inside inline `<code>...</code>` or code blocks `<pre>...</pre>` are ignored and treated as literal text.
- Malformed tokens (e.g. non-numeric IDs, extra spaces) are left as plain text.

## Permissions & Access Control

1. **`MENTION_EVERYONE` permission**:
   - Only users with the `MENTION_EVERYONE` permission or instance `OWNER` can notify via `@everyone`.
   - If a user without this permission sends `@everyone`, it is treated as plain text without notifying room members or populating `mentions.everyone`.

2. **Mentionable Roles (`mentionable`)**:
   - Each role has a `mentionable: boolean` property (configurable in **Settings → Roles**).
   - Only roles with `mentionable: true` appear in mention suggestions and notify assigned users when tagged.

3. **Room Privacy Boundary**:
   - For private rooms (`isPrivate: true`), only users and roles with permission to access the private room are resolved for suggestions and notifications.

## Backend Architecture

- **Persistence**: Messages store resolved mentions in the `mentions` JSON column:
  ```ts
  {
    userIds: number[];
    roleIds: number[];
    everyone: boolean;
  }
  ```
- **Notifications**:
  - Emits `NotificationsDomainEvents.MENTION` event.
  - Sends Web Push notifications to all eligible room members mentioned by userId, mentionable roleId, or `@everyone`.
  - Push notification data includes `type: 'mention'`, `roomId`, `messageId`, and deep-link URL `/text-room/:roomId?message=:messageId`.
- **Unread Counts**:
  - `GET /api/v1/text-rooms/unread-counts` includes `roomMentions: Record<number, number>`.
  - Tracks the count of unread messages mentioning the user per room.

## Frontend UI/UX

1. **Editor & Suggestions**:
   - In text room chats (`CHAT_MENTIONS_ENABLED = true`), typing `@` displays an inline suggestions dropdown.
   - Shows matching users, mentionable roles, and `@everyone` (if the user holds `MENTION_EVERYONE`).
   - Supports keyboard navigation (`ArrowUp`, `ArrowDown`, `Tab`, `Enter`, `Escape`).
   - Inserts a ProseMirror mention node with a Taiga UI chip view.
   - Serialized to canonical tokens `<@id>`, `<@&id>`, `@everyone` on send; deserialized back to chips when editing.

2. **Message Rendering**:
   - In room messages, placeholders are replaced with `app-mention-chip` components.
   - User chips display avatar and `@username`; clicking a user chip opens the profile dialog (`UserDialogService`).
   - Role chips display role color and `@RoleName`.
   - Everyone chips display `@everyone` with a group icon.
   - Accepted mentions of the current user, one of their roles, or `@everyone` use the info appearance on the corresponding chip.

3. **Unread Mention Badge**:
   - Aside navigation replaces the unread count badge with an `@` badge (`tui-badge-notification`, accent, top slot) while the room has unread mentions.
   - Selecting the room does not clear unread counts by itself. The mention badge decreases as the mentioned messages are marked read and is cleared by read-all.

4. **Deep-linking & Jumping**:
   - Opening a mention notification deep-links to `/text-room/:roomId?message=:messageId`.
   - `TextRoomComponent` reads the `message` query parameter, calls `chatStore.jumpToMessage(messageId)` (fetching history around the message if necessary), and removes the query parameter from the URL.
