import type { TPushNotificationData } from '@konvoez/shared';

function isPositiveInt(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

/**
 * Resolves and sanitizes the target router URL from notification data and optional action.
 * Only internal, relative paths (starting with '/' without protocol-relative '//')
 * are accepted to prevent open-redirect vulnerabilities.
 */
export function resolveNotificationUrl(
  data?: TPushNotificationData | null,
  action?: string,
): string | null {
  if (!data) {
    return null;
  }

  const specificActionUrl =
    action && action !== 'default' ? data.onActionClick?.[action]?.url : null;
  const defaultActionUrl = data.onActionClick?.['default']?.url;

  const raw =
    specificActionUrl ||
    data.url ||
    defaultActionUrl ||
    ((data.type === 'mention' ||
      data.type === 'reply' ||
      data.type === 'reaction') &&
    isPositiveInt(data.roomId)
      ? data.messageId
        ? `/text-room/${data.roomId}?message=${data.messageId}`
        : `/text-room/${data.roomId}`
      : null) ||
    (isPositiveInt(data.senderId) ? `/direct/${data.senderId}` : null) ||
    (isPositiveInt(data.callerId) ? `/direct/${data.callerId}` : null) ||
    (isPositiveInt(data.roomId) ? `/text-room/${data.roomId}` : null) ||
    (data.type === 'direct-message' && isPositiveInt(data.recipientId)
      ? `/direct/${data.recipientId}`
      : null);

  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\')
  ) {
    return trimmed;
  }

  return null;
}
