import { t } from '../main/i18n';
import type { IKonvoezLocalBridge } from '../preload/local-preload';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

async function initServerPage(): Promise<void> {
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const serverInput = document.getElementById(
    'server-input',
  ) as HTMLInputElement | null;
  const statusEl = document.getElementById('status-message');
  const connectBtn = document.getElementById(
    'connect-btn',
  ) as HTMLButtonElement | null;

  if (!serverInput || !connectBtn || !statusEl) {
    return;
  }

  let locale = 'en';
  try {
    const config = await window.konvoezLocal.getConfig();
    locale = config.locale;
    if (titleEl) {
      titleEl.textContent = t('server.title', locale);
    }
    if (subtitleEl) {
      subtitleEl.textContent = t('server.subtitle', locale);
    }
    serverInput.placeholder = t('server.placeholder', locale);
    connectBtn.textContent = t('server.connect', locale);

    if (config.serverOrigin) {
      serverInput.value = config.serverOrigin;
    }
  } catch {
    // defaults to en
  }

  const setStatus = (
    msg: string,
    type: 'error' | 'success' | 'info' = 'error',
  ) => {
    statusEl.textContent = msg;
    statusEl.className = `status-message ${type}`;
  };

  const handleConnect = async () => {
    const rawUrl = serverInput.value.trim();
    if (!rawUrl) {
      setStatus(t('server.errorInvalid', locale), 'error');
      return;
    }

    connectBtn.disabled = true;
    connectBtn.textContent = t('server.connecting', locale);
    setStatus('', 'info');

    try {
      await window.konvoezLocal.saveServer(rawUrl);
    } catch (err: unknown) {
      connectBtn.disabled = false;
      connectBtn.textContent = t('server.connect', locale);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('INSECURE')) {
        setStatus(t('server.errorInsecure', locale), 'error');
      } else if (
        errMsg.includes('INVALID_URL') ||
        errMsg.includes('INVALID_RESPONSE')
      ) {
        setStatus(t('server.errorInvalid', locale), 'error');
      } else {
        setStatus(t('server.errorUnreachable', locale), 'error');
      }
    }
  };

  connectBtn.addEventListener('click', () => {
    void handleConnect();
  });

  serverInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      void handleConnect();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  void initServerPage();
});
