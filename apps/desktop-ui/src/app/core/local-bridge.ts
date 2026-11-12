import type { IKonvoezLocalBridge } from '@konvoez/client-shell';

export function readLocalBridge(): IKonvoezLocalBridge {
  const bridge = (window as unknown as { konvoezLocal?: IKonvoezLocalBridge })
    .konvoezLocal;
  if (!bridge) {
    throw new Error('window.konvoezLocal bridge is not available');
  }
  return bridge;
}
