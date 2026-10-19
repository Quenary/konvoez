import { InjectionToken } from '@angular/core';

export const CHAT_MENTIONS_ENABLED = new InjectionToken<boolean>(
  'CHAT_MENTIONS_ENABLED',
  { factory: () => false },
);
