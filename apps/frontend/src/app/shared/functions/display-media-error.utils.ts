function errorName(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return '';
  }
  return typeof error.name === 'string' ? error.name : '';
}

function errorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return '';
  }
  return typeof error.message === 'string' ? error.message : '';
}

function cancellationMessageHints(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('cancel') ||
    lower.includes('dismiss') ||
    lower.includes('denied') ||
    lower.includes('permission') ||
    lower.includes('aborted') ||
    lower.includes('user')
  );
}

/**
 * AbortError from unsupported or invalid system-audio (loopback) constraints.
 * Safe to retry getDisplayMedia with `audio: false` after the user already picked a source.
 */
export function isDisplayMediaAudioConstraintsAbortError(
  error: unknown,
): boolean {
  const name = errorName(error);
  const message = errorMessage(error);
  if (
    name !== 'AbortError' ||
    !message.toLowerCase().includes('capture constraints')
  ) {
    return false;
  }
  return !cancellationMessageHints(message);
}

/**
 * User dismissed the desktop picker or denied screen capture — not an application error.
 */
export function isDisplayMediaUserCancellation(error: unknown): boolean {
  const name = errorName(error);
  const message = errorMessage(error);

  if (name === 'NotAllowedError') {
    return true;
  }

  if (name !== 'AbortError') {
    return false;
  }

  if (isDisplayMediaAudioConstraintsAbortError(error)) {
    return false;
  }

  if (cancellationMessageHints(message)) {
    return true;
  }

  const lower = message.toLowerCase();
  if (lower === '') {
    return true;
  }

  return (
    lower.includes('error starting') ||
    lower.includes('failed to start') ||
    lower.includes('could not start')
  );
}
