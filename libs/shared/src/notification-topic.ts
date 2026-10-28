const BASE64URL_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Encodes 16 raw bytes (represented as a 32-character hex string, e.g. a UUID
 * without hyphens) into a 22-character unpadded URL-safe base64 string.
 *
 * If the input is not a 32-character hex string (e.g. arbitrary string ID),
 * falls back to sanitizing URL-safe characters truncated to 22 chars.
 */
export function encodeUuidToBase64Url(uuid: string): string {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (/^[0-9a-f]{32}$/.test(hex)) {
    let result = '';
    for (let i = 0; i < 30; i += 6) {
      const b0 = parseInt(hex.slice(i, i + 2), 16);
      const b1 = parseInt(hex.slice(i + 2, i + 4), 16);
      const b2 = parseInt(hex.slice(i + 4, i + 6), 16);
      const triple = (b0 << 16) | (b1 << 8) | b2;
      result +=
        BASE64URL_CHARS[(triple >> 18) & 0x3f] +
        BASE64URL_CHARS[(triple >> 12) & 0x3f] +
        BASE64URL_CHARS[(triple >> 6) & 0x3f] +
        BASE64URL_CHARS[triple & 0x3f];
    }
    const lastByte = parseInt(hex.slice(30, 32), 16);
    result +=
      BASE64URL_CHARS[(lastByte >> 2) & 0x3f] +
      BASE64URL_CHARS[(lastByte << 4) & 0x3f];
    return result;
  }

  const sanitized = uuid.replace(/[^A-Za-z0-9_-]/g, '');
  return (sanitized || 'id').slice(0, 22);
}

/**
 * Unified notification topic/tag for all alerts caused by a message
 * (direct message, reply, mention). Length: 4 ('msg_') + 22 = 26 chars (<= 32).
 */
export function buildMessageNotificationTopic(messageId: string): string {
  return `msg_${encodeUuidToBase64Url(messageId)}`;
}

/**
 * Topic/tag for a reaction from a specific user on a message.
 * Length: 3 ('rx_') + 22 (b64) + 1 ('_') + senderIdBase36 (1-4) = 27-30 chars (<= 32).
 */
export function buildReactionNotificationTopic(
  messageId: string,
  senderId: number,
): string {
  return `rx_${encodeUuidToBase64Url(messageId)}_${Math.max(0, senderId).toString(36)}`;
}

/**
 * Topic/tag for an incoming voice call alert.
 * Length: 5 ('call_') + 22 (b64) = 27 chars (<= 32).
 */
export function buildCallNotificationTopic(callId: string): string {
  return `call_${encodeUuidToBase64Url(callId)}`;
}
