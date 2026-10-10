import type { IKonvoezDesktopBridge } from '@konvoez/shared';

declare global {
  interface Window {
    konvoezDesktop?: IKonvoezDesktopBridge;
  }
}

export function getDesktopBridge(): IKonvoezDesktopBridge | null {
  return typeof window !== 'undefined' ? (window.konvoezDesktop ?? null) : null;
}
