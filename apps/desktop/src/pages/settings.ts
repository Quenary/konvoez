import { t, type TI18nKey } from '../main/i18n';
import { formatKeyboardEventToAccelerator } from '../main/accelerator';
import type { IKonvoezLocalBridge } from '../preload/local-preload';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

async function initSettingsPage(): Promise<void> {
  const titleEl = document.getElementById('title');
  const lblHotkeys = document.getElementById('lbl-hotkeys');
  const lblToggleMic = document.getElementById('lbl-toggle-mic');
  const lblToggleSpeaker = document.getElementById('lbl-toggle-speaker');
  const micInput = document.getElementById(
    'mic-hotkey-input',
  ) as HTMLInputElement | null;
  const speakerInput = document.getElementById(
    'speaker-hotkey-input',
  ) as HTMLInputElement | null;
  const micStatus = document.getElementById('mic-status');
  const speakerStatus = document.getElementById('speaker-status');
  const autostartCheckbox = document.getElementById(
    'autostart-checkbox',
  ) as HTMLInputElement | null;
  const lblAutostart = document.getElementById('lbl-autostart');
  const changeServerLink = document.getElementById('change-server-link');
  const settingsStatus = document.getElementById('settings-status');
  const saveBtn = document.getElementById(
    'save-btn',
  ) as HTMLButtonElement | null;

  if (
    !micInput ||
    !speakerInput ||
    !micStatus ||
    !speakerStatus ||
    !autostartCheckbox ||
    !saveBtn
  ) {
    return;
  }

  let locale = 'en';
  let micKey: string | null = null;
  let speakerKey: string | null = null;

  try {
    const config = await window.konvoezLocal.getConfig();
    locale = config.locale;

    if (titleEl) {
      titleEl.textContent = t('settings.title', locale);
    }
    if (lblHotkeys) {
      lblHotkeys.textContent = t('settings.hotkeys', locale);
    }
    if (lblToggleMic) {
      lblToggleMic.textContent = t('settings.toggleMic', locale);
    }
    if (lblToggleSpeaker) {
      lblToggleSpeaker.textContent = t('settings.toggleSpeaker', locale);
    }
    if (lblAutostart) {
      lblAutostart.textContent = t('settings.autostart', locale);
    }
    if (changeServerLink) {
      changeServerLink.textContent = t('settings.changeServer', locale);
    }
    saveBtn.textContent = t('settings.save', locale);

    micInput.placeholder = t('settings.pressKey', locale);
    speakerInput.placeholder = t('settings.pressKey', locale);

    micKey = config.hotkeys.toggleMic;
    speakerKey = config.hotkeys.toggleSpeaker;

    micInput.value = micKey ?? '';
    speakerInput.value = speakerKey ?? '';
    autostartCheckbox.checked = config.autostart;
  } catch {
    micInput.placeholder = t('settings.pressKey', locale);
    speakerInput.placeholder = t('settings.pressKey', locale);
  }

  function setupHotkeyRecording(
    input: HTMLInputElement,
    getKey: () => string | null,
    setKey: (val: string | null) => void,
  ): void {
    let recording = false;

    const startRecording = () => {
      if (recording) {
        return;
      }
      recording = true;
      input.classList.add('recording');
      input.placeholder = t('settings.pressKey', locale);
      window.konvoezLocal.suspendHotkeys();
    };

    const stopRecording = (restore = false) => {
      if (!recording) {
        return;
      }
      recording = false;
      input.classList.remove('recording');
      input.placeholder = t('settings.pressKey', locale);
      window.konvoezLocal.resumeHotkeys();
      if (restore) {
        input.value = getKey() ?? '';
      }
    };

    input.addEventListener('click', () => {
      startRecording();
    });

    input.addEventListener('focus', () => {
      startRecording();
    });

    input.addEventListener('blur', () => {
      if (recording) {
        stopRecording(true);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (!recording) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        stopRecording(true);
        input.blur();
        return;
      }

      if (e.key === 'Backspace') {
        setKey(null);
        input.value = '';
        stopRecording(false);
        input.blur();
        return;
      }

      const accel = formatKeyboardEventToAccelerator(e);
      if (accel) {
        setKey(accel);
        input.value = accel;
        stopRecording(false);
        input.blur();
      }
    });
  }

  setupHotkeyRecording(
    micInput,
    () => micKey,
    (val) => {
      micKey = val;
    },
  );

  setupHotkeyRecording(
    speakerInput,
    () => speakerKey,
    (val) => {
      speakerKey = val;
    },
  );

  if (changeServerLink) {
    changeServerLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'server.html';
    });
  }

  const renderHotkeyStatus = (
    el: HTMLElement,
    status: string | undefined,
  ): void => {
    if (!status) {
      el.textContent = '';
      el.className = 'status-message';
      return;
    }

    const key = `hotkeys.${status}` as TI18nKey;
    const msg = t(key, locale);
    el.textContent = msg;

    if (status === 'ok') {
      el.className = 'status-message success';
    } else if (status === 'conflict' || status === 'invalid') {
      el.className = 'status-message error';
    } else {
      el.className = 'status-message';
    }
  };

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    if (settingsStatus) {
      settingsStatus.textContent = '';
      settingsStatus.className = 'status-message';
    }

    try {
      const res = await window.konvoezLocal.saveSettings({
        hotkeys: {
          toggleMic: micKey,
          toggleSpeaker: speakerKey,
        },
        autostart: autostartCheckbox.checked,
      });

      renderHotkeyStatus(micStatus, res.hotkeys['toggleMic']);
      renderHotkeyStatus(speakerStatus, res.hotkeys['toggleSpeaker']);

      if (settingsStatus) {
        settingsStatus.textContent = t('settings.saved', locale);
        settingsStatus.className = 'status-message success';
      }
    } catch {
      if (settingsStatus) {
        settingsStatus.textContent = t('settings.saveFailed', locale);
        settingsStatus.className = 'status-message error';
      }
    } finally {
      saveBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  void initSettingsPage();
});
