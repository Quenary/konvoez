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
        path: 'text-chat/:id',
        loadComponent: () =>
          import('./features/text-chat/text-chat.component').then((m) => m.TextChatComponent),
      },
      {
        path: 'voice-chat/:id',
        loadComponent: () =>
          import('./features/voice-chat/voice-chat.component').then((m) => m.VoiceChatComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'main',
  },
];
