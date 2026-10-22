import {
  messageMediaFrame,
  messageHasMedia,
} from '@shared/functions/message-media-frame.function';
import { IMessageEntity } from '../chat.store';

export type ChatRow =
  | { readonly kind: 'skeleton-top'; readonly key: 'skel-top' }
  | { readonly kind: 'divider'; readonly key: 'divider' }
  | {
      readonly kind: 'message';
      readonly key: string;
      readonly message: IMessageEntity;
    }
  | { readonly kind: 'skeleton-bottom'; readonly key: 'skel-bottom' };

export type ChatRowsInput = {
  readonly messages: readonly IMessageEntity[];
  readonly unreadDividerMessageId: string | null;
  readonly loadingOlder: boolean;
  readonly loadingNewer: boolean;
};

/**
 * Key that survives the server ack of an optimistic message: the pending
 * entity and the confirmed one share `clientId`.
 */
export function messageRowKey(message: IMessageEntity): string {
  return `msg:${message.clientId ?? message.id}`;
}

/** Flat list of virtual rows: skeletons at loading edges, the divider, messages. */
export function buildChatRows(input: ChatRowsInput): ChatRow[] {
  const rows: ChatRow[] = [];
  if (input.loadingOlder) {
    rows.push({ kind: 'skeleton-top', key: 'skel-top' });
  }
  for (const message of input.messages) {
    if (message.id === input.unreadDividerMessageId) {
      rows.push({ kind: 'divider', key: 'divider' });
    }
    rows.push({ kind: 'message', key: messageRowKey(message), message });
  }
  if (input.loadingNewer) {
    rows.push({ kind: 'skeleton-bottom', key: 'skel-bottom' });
  }
  return rows;
}

export const SKELETON_ROW_SIZE = 48;
export const DIVIDER_ROW_SIZE = 32;
const MESSAGE_BASE_SIZE = 56;
const TEXT_LINE_SIZE = 20;
const CHARS_PER_LINE = 60;
const MAX_ESTIMATED_LINES = 10;
const UNSIZED_MEDIA_SIZE = 240;
/** Matches `min(60vh, 28rem)` of the media row in chat-message. */
const MEDIA_MAX_HEIGHT = 448;
const MEDIA_ROW_SHARE = 0.9;

function textLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').length;
}

/** Initial height estimate of a row before it is measured. */
export function estimateChatRowSize(row: ChatRow, listWidth: number): number {
  if (row.kind === 'skeleton-top' || row.kind === 'skeleton-bottom') {
    return SKELETON_ROW_SIZE;
  }
  if (row.kind === 'divider') {
    return DIVIDER_ROW_SIZE;
  }
  const message = row.message;
  const length = textLength(message.content ?? '');
  const lines = length
    ? Math.min(MAX_ESTIMATED_LINES, Math.ceil(length / CHARS_PER_LINE))
    : 0;
  let size = MESSAGE_BASE_SIZE + lines * TEXT_LINE_SIZE;
  if (messageHasMedia(message)) {
    const frame = messageMediaFrame(message);
    if (frame) {
      const width = Math.min(
        listWidth * MEDIA_ROW_SHARE,
        frame.width,
        MEDIA_MAX_HEIGHT * frame.heightFactor,
      );
      size += width / frame.heightFactor;
    } else {
      size += UNSIZED_MEDIA_SIZE;
    }
  }
  return Math.round(size);
}

/** Whether becoming visible should mark the message as read for this user. */
export function isReadTrackable(
  message: IMessageEntity,
  currentUserId: number | null,
): boolean {
  return (
    message.senderId !== currentUserId &&
    !message.isRead &&
    !message.isPendingCreate
  );
}
