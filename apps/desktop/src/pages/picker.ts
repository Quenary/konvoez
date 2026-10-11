import { t } from '../main/i18n';
import type { IKonvoezLocalBridge } from '../preload/local-preload';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

interface ISourceItem {
  id: string;
  name: string;
  thumbnailUrl: string;
  appIconUrl: string | null;
}

async function initPickerPage(): Promise<void> {
  const titleEl = document.getElementById('title');
  const tabScreens = document.getElementById(
    'tab-screens',
  ) as HTMLButtonElement | null;
  const tabWindows = document.getElementById(
    'tab-windows',
  ) as HTMLButtonElement | null;
  const gridEl = document.getElementById('sources-grid');
  const cancelBtn = document.getElementById(
    'cancel-btn',
  ) as HTMLButtonElement | null;
  const shareBtn = document.getElementById(
    'share-btn',
  ) as HTMLButtonElement | null;
  const audioCheckbox = document.getElementById(
    'audio-checkbox',
  ) as HTMLInputElement | null;
  const audioCheckboxLabel = document.getElementById('audio-checkbox-label');
  const audioHint = document.getElementById('audio-hint');

  if (!tabScreens || !tabWindows || !gridEl || !cancelBtn || !shareBtn) {
    return;
  }

  let locale = 'en';
  try {
    const config = await window.konvoezLocal.getConfig();
    locale = config.locale;
    document.title = t('picker.title', locale);
    if (titleEl) {
      titleEl.textContent = t('picker.title', locale);
    }
    tabScreens.textContent = t('picker.screens', locale);
    tabWindows.textContent = t('picker.windows', locale);
    cancelBtn.textContent = t('picker.cancel', locale);
    shareBtn.textContent = t('picker.share', locale);
    if (audioCheckboxLabel) {
      audioCheckboxLabel.textContent = t('picker.shareAudio', locale);
    }
    if (audioHint) {
      audioHint.textContent = t('picker.shareAudioHint', locale);
    }
    if (audioCheckbox && typeof config.shareAudio === 'boolean') {
      audioCheckbox.checked = config.shareAudio;
    }
  } catch {
    // default fallbacks in HTML
  }

  let activeTab: 'screens' | 'windows' = 'screens';
  let allSources: ISourceItem[] = [];
  let selectedId: string | null = null;

  try {
    allSources = await window.konvoezLocal.getPickerSources();
  } catch (err) {
    console.error('Failed to get sources:', err);
  }

  const renderSources = () => {
    gridEl.innerHTML = '';
    const currentSources = allSources.filter((s) =>
      activeTab === 'screens'
        ? !s.id.startsWith('window:')
        : s.id.startsWith('window:'),
    );

    if (currentSources.length === 0) {
      selectedId = null;
      shareBtn.disabled = true;
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-sources';
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.textContent =
        activeTab === 'screens'
          ? t('picker.noScreens', locale)
          : t('picker.noWindows', locale);
      gridEl.appendChild(emptyMsg);
      return;
    }

    if (currentSources.length > 0 && !selectedId) {
      selectedId = currentSources[0].id;
      shareBtn.disabled = false;
    } else if (selectedId && !currentSources.some((s) => s.id === selectedId)) {
      selectedId = currentSources.length > 0 ? currentSources[0].id : null;
      shareBtn.disabled = selectedId === null;
    }

    for (const source of currentSources) {
      const card = document.createElement('div');
      card.className = `source-card ${source.id === selectedId ? 'selected' : ''}`;

      const thumb = document.createElement('img');
      thumb.className = 'source-thumb';
      thumb.src = source.thumbnailUrl;
      thumb.alt = source.name;

      const titleRow = document.createElement('div');
      titleRow.className = 'source-title-row';

      if (source.appIconUrl) {
        const icon = document.createElement('img');
        icon.className = 'source-app-icon';
        icon.src = source.appIconUrl;
        titleRow.appendChild(icon);
      }

      const name = document.createElement('span');
      name.className = 'source-name';
      name.textContent = source.name;
      name.title = source.name;
      titleRow.appendChild(name);

      card.appendChild(thumb);
      card.appendChild(titleRow);

      card.addEventListener('click', () => {
        selectedId = source.id;
        shareBtn.disabled = false;
        const cards = gridEl.querySelectorAll('.source-card');
        cards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      card.addEventListener('dblclick', () => {
        selectedId = source.id;
        window.konvoezLocal.pickSource(
          selectedId,
          audioCheckbox ? audioCheckbox.checked : true,
        );
      });

      gridEl.appendChild(card);
    }
  };

  if (audioCheckbox) {
    audioCheckbox.addEventListener('change', () => {
      void window.konvoezLocal.saveSettings({
        shareAudio: audioCheckbox.checked,
      });
    });
  }

  tabScreens.addEventListener('click', () => {
    if (activeTab !== 'screens') {
      activeTab = 'screens';
      tabScreens.classList.add('active');
      tabWindows.classList.remove('active');
      renderSources();
    }
  });

  tabWindows.addEventListener('click', () => {
    if (activeTab !== 'windows') {
      activeTab = 'windows';
      tabWindows.classList.add('active');
      tabScreens.classList.remove('active');
      renderSources();
    }
  });

  cancelBtn.addEventListener('click', () => {
    window.konvoezLocal.pickSource(
      null,
      audioCheckbox ? audioCheckbox.checked : true,
    );
  });

  shareBtn.addEventListener('click', () => {
    if (selectedId) {
      window.konvoezLocal.pickSource(
        selectedId,
        audioCheckbox ? audioCheckbox.checked : true,
      );
    }
  });

  renderSources();
}

document.addEventListener('DOMContentLoaded', () => {
  void initPickerPage();
});
