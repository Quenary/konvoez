import { describe, expect, it } from 'vitest';
import { readSavedServers, writeSavedServers } from './saved-servers';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe('saved servers storage', () => {
  it('round-trips addresses and ignores a corrupt payload', () => {
    const storage = memoryStorage();
    expect(readSavedServers(storage)).toEqual([]);

    writeSavedServers(storage, ['https://a.example', 'https://b.example']);
    expect(readSavedServers(storage)).toEqual([
      'https://a.example',
      'https://b.example',
    ]);

    storage.setItem('konvoez.savedServers', '{');
    expect(readSavedServers(storage)).toEqual([]);

    storage.setItem('konvoez.savedServers', JSON.stringify({ url: 'nope' }));
    expect(readSavedServers(storage)).toEqual([]);
  });

  it('stores origins, drops addresses that cannot be joined, and skips duplicates', () => {
    const storage = memoryStorage();
    storage.setItem(
      'konvoez.savedServers',
      JSON.stringify([
        'https://a.example/room',
        'a.example',
        'http://localhost:3000/chat',
        'http://insecure.example',
        'not a url',
      ]),
    );

    expect(readSavedServers(storage)).toEqual([
      'https://a.example',
      'http://localhost:3000',
    ]);
  });
});
