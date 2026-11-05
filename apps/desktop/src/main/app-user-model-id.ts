export const APP_USER_MODEL_ID = 'com.quenary.konvoez';

/**
 * Unpackaged Electron shares the process image with the default Electron icon.
 * A distinct id keeps that association off the installed shortcut.
 */
export function resolveAppUserModelId(isPackaged: boolean): string {
  return isPackaged ? APP_USER_MODEL_ID : `${APP_USER_MODEL_ID}.dev`;
}
