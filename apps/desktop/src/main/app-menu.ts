import type { MenuItemConstructorOptions } from 'electron';
import type { TAppAction } from './app-actions';
import { t } from './i18n';

export function buildAppMenuTemplate(
  items: Record<TAppAction, MenuItemConstructorOptions>,
  locale: string,
  options: { isPackaged: boolean; onCloseWindow: () => void },
): MenuItemConstructorOptions[] {
  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: 'reload' },
    { role: 'forceReload' },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  if (!options.isPackaged) {
    viewSubmenu.push({ type: 'separator' }, { role: 'toggleDevTools' });
  }

  return [
    {
      label: t('menu.file', locale),
      submenu: [
        items.settings,
        items['change-server'],
        items['check-updates'],
        { type: 'separator' },
        items.quit,
      ],
    },
    {
      label: t('menu.edit', locale),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: t('menu.voice', locale),
      submenu: [items['toggle-mic'], items['toggle-speaker']],
    },
    {
      label: t('menu.view', locale),
      submenu: viewSubmenu,
    },
    {
      label: t('menu.window', locale),
      submenu: [
        items.open,
        { role: 'minimize' },
        {
          label: t('menu.close', locale),
          click: () => options.onCloseWindow(),
        },
      ],
    },
  ];
}
