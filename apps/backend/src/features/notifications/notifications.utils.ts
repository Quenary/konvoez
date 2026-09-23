export function isUnsubscribablePushError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return false;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

export function getBrowserName(userAgent?: string): string | null {
  if (!userAgent) {
    return null;
  }

  if (/edg/i.test(userAgent)) {
    return 'edge';
  }
  if (/firefox|fxios/i.test(userAgent)) {
    return 'firefox';
  }
  if (/chrome|crios|crmo/i.test(userAgent)) {
    return 'chrome';
  }
  if (/safari/i.test(userAgent)) {
    return 'safari';
  }

  return 'unknown';
}
