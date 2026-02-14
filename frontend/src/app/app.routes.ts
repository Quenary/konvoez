import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'main',
  },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent),
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
        loadComponent: () => import('./features/main/main.component').then((m) => m.MainComponent),
      },
      {
        path: 'text-room/:id',
        loadComponent: () =>
          import('./features/text-room/text-room.component').then((m) => m.TextRoomComponent),
      },
      {
        path: 'voice-room/:id',
        loadComponent: () =>
          import('./features/voice-room/voice-room.component').then((m) => m.VoiceRoomComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'main',
  },
];
