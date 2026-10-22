import { InjectionToken } from '@angular/core';
import { injectVirtualizer } from '@tanstack/angular-virtual';

export type ChatVirtualizerFactory = typeof injectVirtualizer<
  HTMLElement,
  HTMLElement
>;
export type ChatVirtualizer = ReturnType<ChatVirtualizerFactory>;

/**
 * Creates the chat list virtualizer. A token so specs can replace the
 * layout-dependent virtualizer with a controllable fake.
 */
export const CHAT_VIRTUALIZER_FACTORY =
  new InjectionToken<ChatVirtualizerFactory>('CHAT_VIRTUALIZER_FACTORY', {
    providedIn: 'root',
    factory: () => injectVirtualizer,
  });
