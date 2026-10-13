import type { TPushNotificationData } from '@konvoez/shared';

/**
 * Resolves and sanitizes the target router URL from notification data.
 * Only internal, relative paths (starting with '/' without protocol-relative '//')
 * are accepted to prevent open-redirect vulnerabilities.
 */
export function resolveNotificationUrl(
  data?: TPushNotificationData | null,
): string | null {
  if (!data) {
    return null;
  }

  const raw =
    data.url ||
    data.onActionClick?.['default']?.url ||
    (data.senderId ? `/direct/${data.senderId}` : null) ||
    (data.callerId ? `/direct/${data.callerId}` : null) ||
    (data.roomId ? `/text-room/${data.roomId}` : null) ||
    (data.type === 'direct-message' && data.recipientId
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
