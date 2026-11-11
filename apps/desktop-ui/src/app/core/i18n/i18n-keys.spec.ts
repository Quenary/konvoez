import { describe, it, expect } from 'vitest';
import { desktopTranslations } from '@konvoez/client-shell';

describe('desktop dialog i18n keys', () => {
  const dialogKeyGroups = [
    {
      name: 'server',
      keys: [
        'server.title',
        'server.subtitle',
        'server.placeholder',
        'server.connect',
        'server.connecting',
        'server.errorInsecure',
        'server.errorInvalid',
        'server.errorUnreachable',
      ],
    },
    {
      name: 'settings',
      keys: [
        'settings.title',
        'settings.hotkeys',
        'settings.hotkeysHint',
        'settings.hotkeysHintExclusive',
        'settings.toggleMic',
        'settings.toggleSpeaker',
        'settings.pressKey',
        'settings.clear',
        'settings.autostart',
        'settings.save',
        'settings.saved',
        'settings.saveFailed',
        'hotkeys.ok',
        'hotkeys.conflict',
        'hotkeys.invalid',
        'hotkeys.unset',
      ],
    },
    {
      name: 'source-picker',
      keys: [
        'picker.title',
        'picker.screens',
        'picker.windows',
        'picker.noScreens',
        'picker.noWindows',
        'picker.shareAudio',
        'picker.shareAudioHint',
        'picker.audioSource',
        'picker.allAudio',
        'picker.cancel',
        'picker.share',
      ],
    },
    {
      name: 'updater',
      keys: [
        'updater.updateAvailable',
        'updater.checking',
        'updater.upToDate',
        'updater.downloadAndUpdate',
        'updater.remindLater',
        'updater.downloading',
        'updater.downloadingHint',
        'updater.readyDeferred',
        'updater.ready',
        'updater.restartNow',
        'updater.later',
        'updater.close',
        'updater.retry',
        'updater.checkFailed',
        'updater.downloadFailed',
        'updater.disabled',
        'updater.version',
      ],
    },
  ];

  for (const { name, keys } of dialogKeyGroups) {
    it(`ensures all ${name} dialog keys exist in en and ru dictionaries`, () => {
      for (const key of keys) {
        expect(
          key in desktopTranslations.en,
          `Key "${key}" should exist in en dictionary`,
        ).toBe(true);
        expect(
          key in desktopTranslations.ru,
          `Key "${key}" should exist in ru dictionary`,
        ).toBe(true);
      }
    });
  }
});
