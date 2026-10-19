# Chat reading

Text rooms and direct messages open at the most useful place in the conversation while keeping unread counts tied to messages that have actually been read.

## Opening a chat

The default message page contains up to 25 messages. When unread messages exist, the server anchors the page at the oldest unread message and includes as much preceding history as fits:

- If there are at least 13 unread messages, the page contains up to 12 preceding messages and 13 messages starting at the unread anchor.
- If fewer than 13 messages are unread, the page includes more preceding history and all unread messages.
- If there are no unread messages, the page contains the latest messages.

The list response includes `firstUnreadMessageId`, `hasMoreBefore`, and `hasMoreAfter`. The two `hasMore` flags indicate whether additional pages are available in each direction. Requests before or after a page use the corresponding message cursor.

An explicit message deep link (`?message=...`) takes precedence over the unread anchor and opens the linked message. An explicit `latest: true` list request opens the newest page without applying the unread anchor.

The unread divider is placed before the first unread message returned by the initial or deep-link page. It does not move as pages load, messages are read, or new messages arrive; it is cleared by read-all or when the chat is left and joined again.

## Reading messages and unread counts

Opening a chat does not clear its room or direct-message unread count. Messages are marked read by the existing visibility mechanism when they become visible in the list. Read requests are idempotent, and already-read messages are not sent again during the same chat session.

The scroll-to-bottom button is shown when the list is more than 200 pixels from the bottom or when newer pages are available. It displays the active chat's unread count when that count is non-zero. Clicking it marks the current chat's messages as read and then loads and scrolls to the latest page. Scrolling to the bottom by itself does not mark all messages as read.

Read-all takes a snapshot of the newest message in the chat and marks other users' messages up to that point as read. Messages arriving after the snapshot remain unread. The operation accepts exactly one target: `roomId` or `recipientId`.

## Realtime updates and paging

`UNREAD_COUNTS_CHANGED` replaces the user's unread-count maps across their active sessions. `MESSAGES_READ` updates read receipts for the affected messages in the chat and in the reader's other sessions. Normal visibility-based reads carry message IDs; read-all carries the newest message ID in its snapshot.

When newer pages remain, incoming live messages are not inserted into the current page. They increase the unread count instead. Loading newer pages continues until the live tail is reached, including one follow-up page when a message arrived while a request was in flight. Sending a message while behind first loads the latest page so the outgoing message appears at the tail.

When older history is loaded, the client keeps the first visible message at the same offset in the scroll container, even if the browser has already applied native scroll anchoring or new live messages arrive at the tail.
