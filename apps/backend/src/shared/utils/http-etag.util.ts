export function etagMatches(
  ifNoneMatch: string | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  return ifNoneMatch
    .split(',')
    .map((part) => part.trim())
    .some((part) => part === etag || part === '*');
}
