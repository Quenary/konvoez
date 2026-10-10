import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, shell, type Session } from 'electron';
import { getLocalPagePath } from './window';

export const ALLOWED_PERMISSIONS = [
  'media',
  'notifications',
  'display-capture',
  'fullscreen',
  'clipboard-sanitized-write',
] as const;

export function isAllowedNavigation(
  targetUrl: string,
  serverOrigin: string | null,
  allowedPagesDir = path.dirname(getLocalPagePath('server')),
): boolean {
  try {
    const url = new URL(targetUrl);
    if (url.protocol === 'file:') {
      const filePath = path.resolve(fileURLToPath(url));
      const normalizedAllowedDir = path.resolve(allowedPagesDir);
      return (
        filePath.startsWith(normalizedAllowedDir + path.sep) ||
        filePath === normalizedAllowedDir
      );
    }
    if (serverOrigin && url.origin === serverOrigin) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isAllowedPermission(
  permission: string,
  requestingUrl: string,
  serverOrigin: string | null,
): boolean {
  if (!serverOrigin) {
    return false;
  }
  try {
    const url = new URL(requestingUrl);
    if (url.origin !== serverOrigin) {
      return false;
    }
    return (ALLOWED_PERMISSIONS as readonly string[]).includes(permission);
  } catch {
    return false;
  }
}

export function installSecurityHandlers(
  sess: Session,
  getServerOrigin: () => string | null,
): void {
  // Navigation & external links handler in will-navigate and will-redirect is set on WebContents

  sess.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const origin = getServerOrigin();
    const allowed = isAllowedPermission(
      permission,
      details.requestingUrl,
      origin,
    );
    callback(allowed);
  });

  sess.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    const origin = getServerOrigin();
    return isAllowedPermission(permission, requestingOrigin, origin);
  });

  app.on('web-contents-created', (_, wc) => {
    wc.on('will-attach-webview', (e) => {
      e.preventDefault();
    });

    wc.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    wc.on('will-navigate', (event, url) => {
      const origin = getServerOrigin();
      if (!isAllowedNavigation(url, origin)) {
        event.preventDefault();
        if (url.startsWith('http:') || url.startsWith('https:')) {
          void shell.openExternal(url);
        }
      }
    });

    wc.on('will-redirect', (event, url) => {
      const origin = getServerOrigin();
      if (!isAllowedNavigation(url, origin)) {
        event.preventDefault();
        if (url.startsWith('http:') || url.startsWith('https:')) {
          void shell.openExternal(url);
        }
      }
    });
  });
}
