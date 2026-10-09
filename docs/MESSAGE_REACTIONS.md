# Message Reactions

Users can react to text messages in group rooms and direct messages with emojis. Reactions follow a Telegram-style UX: each user can have at most one active reaction per message.

## Behavior

- **Toggle reaction**: Clicking a reaction emoji that the user has already set removes it.
- **Switch reaction**: Clicking a different emoji replaces the user's previous reaction on that message in-place.
- **Self-reactions**: Users can react to their own messages as well as messages from others.
- **Participant access**: Only participants of the room (or the sender/recipient of a direct message) can add, modify, or remove reactions.

## API

### Toggle Reaction

`PUT /api/v1/text-rooms/messages/:id/reactions`

#### Request Body

```json
{
  "emoji": "👍"
}
```

Validation rules:
- Non-empty string up to 32 characters.
- Must match Unicode emoji regex (`\p{Extended_Pictographic}`, `\p{Emoji_Modifier}`, variation selectors `\uFE0F`, ZWJ `\u200D`, and regional indicator flag pairs). Arbitrary text or raw strings without pictographic characters are rejected with `400 Bad Request`.

#### Response

Returns an array of grouped reactions for the message:

```json
[
  {
    "emoji": "👍",
    "count": 2,
    "userIds": [1, 5]
  },
  {
    "emoji": "🔥",
    "count": 1,
    "userIds": [2]
  }
]
```

#### Errors

- `401 Unauthorized` — unauthenticated session.
- `403 Forbidden` — user is not a participant of the room or direct conversation.
- `404 Not Found` — message does not exist or has been deleted.

## WebSocket Realtime

When a reaction is updated on a message, the server broadcasts an event to the room or direct chat participants:

- **Event**: `text-room:message-reaction-updated` (`ETextRoomEvent.MESSAGE_REACTION_UPDATED`)
- **Payload**:
  ```ts
  interface ITextRoomReactionUpdated {
    messageId: string;
    roomId: number | null;
    recipientId: number | null;
    senderId: number | null;
    reactions: ITextRoomReactionGroup[];
  }
  ```

## Client Implementation

- **Optimistic Updates**: The client optimistically updates reaction pills and user reaction status immediately upon click, rolling back on API error.
- **Sequential Click Queue**: Reaction toggles use `concatMap` in `ChatStore` to ensure rapid sequential clicks are executed in order rather than running concurrent overlapping HTTP PUT requests.
- **Tooltips**: Reaction pills display a tooltip showing usernames of users who reacted (up to 10 names with `+N` for the remainder). Tooltips reactively update on runtime language change (`REACTIONS.YOU` and `REACTIONS.UNKNOWN_USER`).
- **Reactions Bar**: Hovering or opening the context menu on a message exposes frequent reaction shortcuts and an expandable emoji picker.
