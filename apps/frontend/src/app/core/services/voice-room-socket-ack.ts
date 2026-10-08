import type { Socket } from 'socket.io-client';

export const DEFAULT_VOICE_SOCKET_ACK_MS = 5000;
export const VOICE_JOIN_ACK_MS = 10_000;

type AckErrorResponse = { error: string };

function isAckErrorResponse(value: unknown): value is AckErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as AckErrorResponse).error === 'string'
  );
}

/** Socket.io ack with timeout and server-side `{ error }` payloads. */
export async function emitVoiceRoomWithAck<TResponse>(
  socket: Socket,
  event: string,
  payload?: unknown,
  timeoutMs: number = DEFAULT_VOICE_SOCKET_ACK_MS,
): Promise<TResponse> {
  const response = await socket.timeout(timeoutMs).emitWithAck(event, payload);
  if (isAckErrorResponse(response)) {
    throw new Error(response.error);
  }
  return response as TResponse;
}

/** True when socket.io ack timed out (message varies by client version). */
export function isVoiceSocketAckTimeout(error: unknown): boolean {
  return error instanceof Error && /timed out/i.test(error.message);
}
