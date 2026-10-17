import type { Socket } from 'socket.io-client';
import { type TApiErrorResponse, type TWsAckError } from '@konvoez/shared';
import { isApiErrorCode } from './api-error.service';

export const DEFAULT_VOICE_SOCKET_ACK_MS = 5000;
export const VOICE_JOIN_ACK_MS = 10_000;

export class ApiAckError extends Error {
  readonly apiError: TApiErrorResponse;

  constructor(apiError: TApiErrorResponse) {
    super(apiError.code);
    this.name = 'ApiAckError';
    this.apiError = apiError;
  }
}

type LegacyAckError = { error: string };

function isAckErrorResponse(
  value: unknown,
): value is TWsAckError | LegacyAckError {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  if (typeof error === 'string') {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return isApiErrorCode((error as { code: unknown }).code);
  }
  return false;
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
    if (typeof response.error === 'string') {
      if (isApiErrorCode(response.error)) {
        throw new ApiAckError({
          code: response.error,
          message: response.error,
        });
      }
      throw new Error(response.error);
    }
    throw new ApiAckError(response.error);
  }
  return response as TResponse;
}

/** True when socket.io ack timed out (message varies by client version). */
export function isVoiceSocketAckTimeout(error: unknown): boolean {
  return error instanceof Error && /timed out/i.test(error.message);
}
