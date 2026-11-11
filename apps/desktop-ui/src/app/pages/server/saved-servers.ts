import { normalizeServerOrigin } from '@konvoez/client-shell';

const SAVED_SERVERS_STORAGE_KEY = 'konvoez.savedServers';

export function readSavedServers(
  storage: Pick<Storage, 'getItem'>,
): readonly string[] {
  const raw = storage.getItem(SAVED_SERVERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const origins: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string' || item.length === 0) continue;
      try {
        const origin = normalizeServerOrigin(item);
        if (!origins.includes(origin)) origins.push(origin);
      } catch {
        // Drop addresses that cannot be joined.
      }
    }
    return origins;
  } catch {
    return [];
  }
}

export function writeSavedServers(
  storage: Pick<Storage, 'setItem'>,
  servers: readonly string[],
): void {
  storage.setItem(SAVED_SERVERS_STORAGE_KEY, JSON.stringify(servers));
}
