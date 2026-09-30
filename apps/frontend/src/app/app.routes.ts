import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { ownerGuard } from './core/guards/owner.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'direct',
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
    path: 'auth/password-recovery/confirm',
    loadComponent: () =>
      import('./features/auth/auth-password-recovery-confirm/auth-password-recovery-confirm.component').then(
        (m) => m.AuthPasswordRecoveryConfirmComponent,
      ),
  },
  {
    path: 'auth/password-recovery',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/auth/auth-password-recovery/auth-password-recovery.component').then(
        (m) => m.AuthPasswordRecoveryComponent,
      ),
  },
  {
    // Auth zone
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'direct',
        loadComponent: () =>
          import('./features/direct-chats/direct-chats.component').then(
            (m) => m.DirectChatsComponent,
          ),
      },
      {
        path: 'direct/:id',
        data: { isDirect: true },
        loadComponent: () =>
          import('./features/text-room/text-room.component').then(
            (m) => m.TextRoomComponent,
          ),
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
            path: 'notifications',
            loadComponent: () =>
              import('./features/settings/settings-notifications/settings-notifications.component').then(
                (m) => m.SettingsNotificationsComponent,
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
            path: 'users',
            canActivate: [ownerGuard],
            loadComponent: () =>
              import('./features/settings/settings-user-management/settings-user-management.component').then(
                (m) => m.SettingsUserManagementComponent,
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
