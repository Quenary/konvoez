const SAVED_SERVERS_STORAGE_KEY = 'konvoez.savedServers';

export function readSavedServers(
  storage: Pick<Storage, 'getItem'>,
): readonly string[] {
  const raw = storage.getItem(SAVED_SERVERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
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
