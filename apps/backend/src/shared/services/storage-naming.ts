const STORAGE_PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;
const STORAGE_PREFIX_MAX_LENGTH = 42;

export function assertObjectStoragePrefix(prefix: string): void {
  if (prefix === '') {
    return;
  }
  if (
    prefix.length > STORAGE_PREFIX_MAX_LENGTH ||
    !STORAGE_PREFIX_PATTERN.test(prefix)
  ) {
    throw new Error(
      `Invalid OBJECT_STORAGE_PREFIX "${prefix}". Use 1-42 lowercase letters, digits or hyphens, and do not start or end with a hyphen.`,
    );
  }
}

export function resolvePhysicalBucket(logical: string, prefix: string): string {
  return prefix ? `${prefix}-${logical}` : logical;
}

export function toPhysicalRelativePath(
  logicalKey: string,
  prefix: string,
): string {
  const slash = logicalKey.indexOf('/');
  if (slash <= 0) {
    return resolvePhysicalBucket(logicalKey, prefix);
  }
  const logicalBucket = logicalKey.slice(0, slash);
  const rest = logicalKey.slice(slash + 1);
  return `${resolvePhysicalBucket(logicalBucket, prefix)}/${rest}`;
}
