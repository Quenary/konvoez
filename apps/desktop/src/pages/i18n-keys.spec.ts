import { describe, it, expect } from 'vitest';
import { SERVER_DIALOG_I18N_KEYS } from '@konvoez/client-dialogs/k-server-dialog';
import { SETTINGS_DIALOG_I18N_KEYS } from '@konvoez/client-dialogs/k-settings-dialog';
import { SOURCE_PICKER_DIALOG_I18N_KEYS } from '@konvoez/client-dialogs/k-source-picker-dialog';
import { translations } from '../i18n/dictionary';

describe('desktop dialog i18n keys', () => {
  const dialogKeyGroups = [
    { name: 'server', keys: SERVER_DIALOG_I18N_KEYS },
    { name: 'settings', keys: SETTINGS_DIALOG_I18N_KEYS },
    { name: 'source-picker', keys: SOURCE_PICKER_DIALOG_I18N_KEYS },
  ];

  for (const { name, keys } of dialogKeyGroups) {
    it(`ensures all ${name} dialog keys exist in en and ru dictionaries`, () => {
      for (const key of keys) {
        expect(
          key in translations.en,
          `Key "${key}" should exist in en dictionary`,
        ).toBe(true);
        expect(
          key in translations.ru,
          `Key "${key}" should exist in ru dictionary`,
        ).toBe(true);
      }
    });
  }
});
