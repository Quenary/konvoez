import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore, DEFAULT_DESKTOP_CONFIG } from './config-store';

describe('ConfigStore', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-config-test-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns default config when file does not exist', () => {
    const store = new ConfigStore(configPath);
    expect(store.get()).toEqual(DEFAULT_DESKTOP_CONFIG);
  });

  it('saves and reloads valid configuration', () => {
    const store = new ConfigStore(configPath);
    store.set({
      serverOrigin: 'https://konvoez.example.com',
      autostart: true,
      hotkeys: {
        toggleMic: 'CommandOrControl+Shift+M',
        toggleSpeaker: null,
      },
    });

    expect(fs.existsSync(configPath)).toBe(true);

    const reloadedStore = new ConfigStore(configPath);
    expect(reloadedStore.get()).toEqual({
      serverOrigin: 'https://konvoez.example.com',
      autostart: true,
      hotkeys: {
        toggleMic: 'CommandOrControl+Shift+M',
        toggleSpeaker: null,
      },
    });
  });

  it('creates backup and restores defaults on corrupted JSON', () => {
    fs.writeFileSync(configPath, '{ invalid json', 'utf-8');

    const store = new ConfigStore(configPath);
    expect(store.get()).toEqual(DEFAULT_DESKTOP_CONFIG);

    const bakPath = `${configPath}.bak`;
    expect(fs.existsSync(bakPath)).toBe(true);
    expect(fs.readFileSync(bakPath, 'utf-8')).toBe('{ invalid json');
  });

  it('creates backup and restores defaults on schema mismatch', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ serverOrigin: 12345, hotkeys: 'wrong' }),
      'utf-8',
    );

    const store = new ConfigStore(configPath);
    expect(store.get()).toEqual(DEFAULT_DESKTOP_CONFIG);

    const bakPath = `${configPath}.bak`;
    expect(fs.existsSync(bakPath)).toBe(true);
  });
});
