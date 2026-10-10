export type TLanguage = 'en' | 'ru';

export const translations = {
  en: {
    'server.title': 'Connect to Konvoez',
    'server.subtitle': 'Enter the address of your Konvoez server',
    'server.placeholder': 'https://konvoez.example.com',
    'server.connect': 'Connect',
    'server.connecting': 'Connecting...',
    'server.errorInvalid': 'Invalid server address',
    'server.errorInsecure':
      'HTTPS is required (HTTP allowed for localhost only)',
    'server.errorUnreachable': 'Unable to connect to server',
    'tray.open': 'Open Konvoez',
    'tray.muteMic': 'Mute microphone',
    'tray.deafen': 'Deafen',
    'tray.settings': 'Settings…',
    'tray.changeServer': 'Change server…',
    'tray.checkUpdates': 'Check for updates',
    'tray.quit': 'Quit',
    'tray.micMuted': '(mic muted)',
    'tray.deafened': '(deafened)',
    'settings.title': 'Desktop Settings',
    'settings.hotkeys': 'Global Hotkeys',
    'settings.toggleMic': 'Toggle microphone',
    'settings.toggleSpeaker': 'Toggle speaker / deafen',
    'settings.pressKey': 'Press keys...',
    'settings.clear': 'Backspace to clear',
    'settings.autostart': 'Start on system boot',
    'settings.server': 'Server Connection',
    'settings.changeServer': 'Change server',
    'settings.save': 'Save',
    'settings.saved': 'Settings saved',
    'hotkeys.ok': 'Registered',
    'hotkeys.conflict': 'Shortcut conflict with another app',
    'hotkeys.invalid': 'Invalid shortcut',
    'hotkeys.unset': 'Unset',
    'hotkeys.unavailable': 'Hotkeys unavailable on this desktop session',
    'picker.title': 'Share your screen',
    'picker.screens': 'Screens',
    'picker.windows': 'Windows',
    'picker.cancel': 'Cancel',
    'picker.share': 'Share',
    'updater.updateAvailable': 'Update available',
    'updater.downloadPrompt':
      'A new version of Konvoez ({version}) is available. Download now?',
    'updater.download': 'Download',
    'updater.later': 'Later',
    'updater.downloaded': 'Update ready',
    'updater.restartPrompt':
      'Update has been downloaded. Restart Konvoez to apply?',
    'updater.restart': 'Restart',
    'updater.upToDate': 'Konvoez is up to date',
    'updater.checkFailed': 'Failed to check for updates',
  },
  ru: {
    'server.title': 'Подключение к Konvoez',
    'server.subtitle': 'Введите адрес вашего сервера Konvoez',
    'server.placeholder': 'https://konvoez.example.com',
    'server.connect': 'Подключиться',
    'server.connecting': 'Подключение...',
    'server.errorInvalid': 'Неверный адрес сервера',
    'server.errorInsecure':
      'Требуется HTTPS (HTTP разрешён только для localhost)',
    'server.errorUnreachable': 'Не удалось подключиться к серверу',
    'tray.open': 'Открыть Konvoez',
    'tray.muteMic': 'Отключить микрофон',
    'tray.deafen': 'Заглушить звук',
    'tray.settings': 'Настройки…',
    'tray.changeServer': 'Сменить сервер…',
    'tray.checkUpdates': 'Проверить обновления',
    'tray.quit': 'Выход',
    'tray.micMuted': '(микрофон отключен)',
    'tray.deafened': '(звук заглушен)',
    'settings.title': 'Настройки приложения',
    'settings.hotkeys': 'Глобальные горячие клавиши',
    'settings.toggleMic': 'Вкл/выкл микрофон',
    'settings.toggleSpeaker': 'Вкл/выкл звук наушников',
    'settings.pressKey': 'Нажмите клавиши...',
    'settings.clear': 'Backspace для очистки',
    'settings.autostart': 'Запускать при старте системы',
    'settings.server': 'Подключение к серверу',
    'settings.changeServer': 'Сменить сервер',
    'settings.save': 'Сохранить',
    'settings.saved': 'Настройки сохранены',
    'hotkeys.ok': 'Зарегистрировано',
    'hotkeys.conflict': 'Конфликт с другим приложением',
    'hotkeys.invalid': 'Недопустимое сочетание клавиш',
    'hotkeys.unset': 'Не задано',
    'hotkeys.unavailable': 'Горячие клавиши недоступны в этой сессии',
    'picker.title': 'Демонстрация экрана',
    'picker.screens': 'Экраны',
    'picker.windows': 'Окна',
    'picker.cancel': 'Отмена',
    'picker.share': 'Поделиться',
    'updater.updateAvailable': 'Доступно обновление',
    'updater.downloadPrompt':
      'Доступна новая версия Konvoez ({version}). Скачать сейчас?',
    'updater.download': 'Скачать',
    'updater.later': 'Позже',
    'updater.downloaded': 'Обновление готово',
    'updater.restartPrompt':
      'Обновление скачано. Перезапустить Konvoez для применения?',
    'updater.restart': 'Перезапустить',
    'updater.upToDate': 'У вас установлена последняя версия Konvoez',
    'updater.checkFailed': 'Не удалось проверить обновления',
  },
} as const;

export type TI18nKey = keyof (typeof translations)['en'];

export function resolveLanguage(locale?: string): TLanguage {
  const raw = (locale ?? '').toLowerCase();
  return raw.startsWith('ru') ? 'ru' : 'en';
}

export function getDictionary(locale?: string): Record<string, string> {
  const lang = resolveLanguage(locale);
  return translations[lang];
}

export function t(
  key: TI18nKey,
  locale?: string,
  params?: Record<string, string>,
): string {
  const lang = resolveLanguage(locale);
  let text: string = translations[lang][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return text;
}
