import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'server',
    loadComponent: () =>
      import('./pages/server/server-dialog.component').then(
        (m) => m.ServerDialogComponent,
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings-dialog.component').then(
        (m) => m.SettingsDialogComponent,
      ),
  },
  {
    path: 'picker',
    loadComponent: () =>
      import('./pages/picker/source-picker-dialog.component').then(
        (m) => m.SourcePickerDialogComponent,
      ),
  },
  {
    path: 'updater',
    loadComponent: () =>
      import('./pages/updater/updater-dialog.component').then(
        (m) => m.UpdaterDialogComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'server',
  },
];
