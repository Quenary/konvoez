import type { IKonvoezLocalBridge, IUpdaterState } from '@konvoez/client-shell';

/** Present only in the local serve bundle. Production builds must not contain it. */
export const DESKTOP_UI_LOCAL_BRIDGE_MOCK = 'desktop-ui-local-bridge-mock';

function thumbnail(fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="${fill}" width="320" height="180"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function readLocalBridge(): IKonvoezLocalBridge {
  let updaterState: IUpdaterState = {
    status: 'available',
    version: '0.0.0-local',
  };
  const listeners = new Set<(state: IUpdaterState) => void>();

  const emit = (state: IUpdaterState): void => {
    updaterState = state;
    for (const listener of listeners) {
      listener(state);
    }
  };

  return {
    server: {
      getInitial: () =>
        Promise.resolve({
          serverOrigin: 'https://konvoez.example',
          locale: 'ru',
        }),
      saveServer: (url: string) => Promise.resolve({ origin: url }),
    },
    settings: {
      getInitial: () =>
        Promise.resolve({
          hotkeys: {
            toggleMic: 'CommandOrControl+Shift+[',
            toggleSpeaker: 'CommandOrControl+Shift+]',
          },
          autostart: true,
          nativeHotkeys: true,
          locale: 'ru',
        }),
      save: () =>
        Promise.resolve({
          hotkeys: { toggleMic: 'ok', toggleSpeaker: 'ok' },
        }),
      suspendHotkeys: () => undefined,
      resumeHotkeys: () => undefined,
    },
    picker: {
      getInitial: () =>
        Promise.resolve({
          locale: 'ru',
          shareAudio: true,
          audioSupported: true,
          nativeAudio: true,
          audioStreams: [
            { id: 'stream-spotify', name: 'Spotify' },
            { id: 'stream-browser', name: 'Browser' },
          ],
          sources: [
            {
              id: 'screen:0',
              name: 'Screen 1',
              thumbnailUrl: thumbnail('#1e293b'),
              appIconUrl: null,
            },
            {
              id: 'screen:1',
              name: 'Screen 2',
              thumbnailUrl: thumbnail('#334155'),
              appIconUrl: null,
            },
            {
              id: 'screen:2',
              name: 'Screen 3',
              thumbnailUrl: thumbnail('#0f172a'),
              appIconUrl: null,
            },
            {
              id: 'window:1',
              name: 'Konvoez',
              thumbnailUrl: thumbnail('#1e3a5f'),
              appIconUrl: null,
            },
            {
              id: 'window:2',
              name: 'Editor',
              thumbnailUrl: thumbnail('#3f3f46'),
              appIconUrl: null,
            },
            {
              id: 'window:3',
              name: 'Terminal',
              thumbnailUrl: thumbnail('#18181b'),
              appIconUrl: null,
            },
            {
              id: 'window:4',
              name: 'Browser',
              thumbnailUrl: thumbnail('#1c1917'),
              appIconUrl: null,
            },
          ],
        }),
      setShareAudio: () => undefined,
      pick: () => undefined,
    },
    updater: {
      getInitial: () => Promise.resolve({ state: updaterState, locale: 'ru' }),
      getState: () => Promise.resolve(updaterState),
      onState: (callback) => {
        listeners.add(callback);
        return () => {
          listeners.delete(callback);
        };
      },
      download: () => {
        emit({
          status: 'downloading',
          version: '0.0.0-local',
          progress: {
            percent: 42,
            transferred: 42_000_000,
            total: 100_000_000,
            bytesPerSecond: 2_000_000,
          },
        });
        setTimeout(() => {
          emit({ status: 'ready', version: '0.0.0-local' });
        }, 600);
      },
      later: () => undefined,
      restart: () => undefined,
      retry: () => {
        emit({ status: 'available', version: '0.0.0-local' });
      },
    },
  };
}
