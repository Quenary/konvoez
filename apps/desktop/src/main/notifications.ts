import { Notification, type BrowserWindow } from 'electron';
import { EDesktopIpc, type TPushNotificationPayload } from '@konvoez/shared';
import { getAppIcon, showMainWindow } from './window';

interface ActiveNotificationEntry {
  notification: Notification;
  messageId?: string;
}

export class NotificationManager {
  private readonly activeNotifications = new Map<
    string,
    ActiveNotificationEntry
  >();

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
        this.activeNotifications.get(tag)?.notification.close();
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
      if (win && !win.isDestroyed()) {
        win.webContents.send(EDesktopIpc.NOTIFICATION_CLICK, payload);
      }
    });

    if (tag) {
      const entry: ActiveNotificationEntry = {
        notification,
        messageId: payload.data?.messageId,
      };
      this.activeNotifications.set(tag, entry);
      notification.on('close', () => {
        if (this.activeNotifications.get(tag) === entry) {
          this.activeNotifications.delete(tag);
        }
      });
    }

    notification.show();
    return notification;
  }

  public close(tag: string): void {
    const entry = this.activeNotifications.get(tag);
    if (entry) {
      try {
        entry.notification.close();
      } catch {
        // ignore
      }
      this.activeNotifications.delete(tag);
    }
  }

  public closeByMessageId(messageId: string): void {
    for (const [tag, entry] of this.activeNotifications.entries()) {
      if (entry.messageId === messageId) {
        try {
          entry.notification.close();
        } catch {
          // ignore
        }
        this.activeNotifications.delete(tag);
      }
    }
  }

  public dismiss(payload: { tag?: string; messageId?: string }): void {
    if (payload.tag) {
      this.close(payload.tag);
      return;
    }
    if (payload.messageId) {
      this.closeByMessageId(payload.messageId);
    }
  }

  public clear(): void {
    for (const entry of this.activeNotifications.values()) {
      try {
        entry.notification.close();
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

export function dismissNotification(payload: {
  tag?: string;
  messageId?: string;
}): void {
  defaultNotificationManager.dismiss(payload);
}
