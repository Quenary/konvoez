import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'main',
  },
  {
    path: 'auth',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/auth/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/auth-register/auth-register.component').then(
        (m) => m.AuthRegisterComponent,
      ),
  },
  {
    // Auth zone
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'main',
        loadComponent: () =>
          import('./features/main/main.component').then((m) => m.MainComponent),
      },
      {
        path: 'text-room/:id',
        loadComponent: () =>
          import('./features/text-room/text-room.component').then(
            (m) => m.TextRoomComponent,
          ),
      },
      {
        path: 'voice-room/:id',
        loadComponent: () =>
          import('./features/voice-room/voice-room.component').then(
            (m) => m.VoiceRoomComponent,
          ),
      },
      {
        path: 'settings',
        children: [
          {
            path: '',
            redirectTo: 'profile',
            pathMatch: 'full',
          },
          {
            path: 'profile',
            loadComponent: () =>
              import('./features/settings/settings-profile/settings-profile.component').then(
                (m) => m.SettingsProfileComponent,
              ),
          },
          {
            path: 'devices',
            loadComponent: () =>
              import('./features/settings/settings-devices/settings-devices.component').then(
                (m) => m.SettingsDevicesComponent,
              ),
          },
          {
            path: 'invites',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/settings/settings-invites/settings-invites.component').then(
                (m) => m.SettingsInvitesComponent,
              ),
          },
          {
            path: 'admin',
            canActivate: [adminGuard],
            loadComponent: () =>
              import('./features/settings/settings-admin/settings-admin.component').then(
                (m) => m.SettingsAdminComponent,
              ),
          },
        ],
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'main',
  },
];
