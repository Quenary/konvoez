import { Notification, type BrowserWindow } from 'electron';
import type { TPushNotificationPayload } from '@konvoez/shared';
import { getAppIcon, showMainWindow } from './window';

export class NotificationManager {
  private readonly activeNotifications = new Map<string, Notification>();

  constructor(
    private readonly notificationClass: typeof Notification = Notification,
  ) {}

  public show(
    payload: TPushNotificationPayload,
    win: BrowserWindow | null,
  ): Notification | null {
    if (!this.notificationClass.isSupported()) {
      return null;
    }

    const tag = payload.tag;
    if (tag && this.activeNotifications.has(tag)) {
      try {
        this.activeNotifications.get(tag)?.close();
      } catch {
        // ignore
      }
      this.activeNotifications.delete(tag);
    }

    const notification = new this.notificationClass({
      title: payload.title,
      body: payload.body,
      icon: getAppIcon(),
      silent: false,
    });

    notification.on('click', () => {
      showMainWindow(win);
    });

    if (tag) {
      this.activeNotifications.set(tag, notification);
      notification.on('close', () => {
        if (this.activeNotifications.get(tag) === notification) {
          this.activeNotifications.delete(tag);
        }
      });
    }

    notification.show();
    return notification;
  }

  public clear(): void {
    for (const n of this.activeNotifications.values()) {
      try {
        n.close();
      } catch {
        // ignore
      }
    }
    this.activeNotifications.clear();
  }
}

export const defaultNotificationManager = new NotificationManager();

export function showNotification(
  payload: TPushNotificationPayload,
  win: BrowserWindow | null,
): void {
  defaultNotificationManager.show(payload, win);
}
