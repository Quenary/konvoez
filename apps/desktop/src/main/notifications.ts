import { Notification, type BrowserWindow } from 'electron';
import {
  EDesktopIpc,
  isUuidAtOrBefore,
  type TDesktopNotificationDismiss,
  type TDesktopNotificationUpdate,
  type TNotificationUpdatePayload,
  type TPushNotificationPayload,
} from '@konvoez/shared';
import { getAppIcon, showMainWindow } from './window';

interface ActiveNotificationEntry {
  notification: Notification;
  messageId?: string;
  data?: TPushNotificationPayload['data'];
  window: BrowserWindow | null;
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
    silent = false,
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
      silent,
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
        data: payload.data,
        window: win,
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

  public update(
    payload: TNotificationUpdatePayload,
    win: BrowserWindow | null,
  ): Notification | null {
    const existing = this.activeNotifications.get(payload.tag);
    if (!existing) {
      return null;
    }

    this.close(payload.tag);
    return this.show(payload, win ?? existing.window, true);
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

  public dismiss(payload: TDesktopNotificationDismiss): void {
    if (payload.tag) {
      this.close(payload.tag);
      return;
    }
    for (const tag of payload.tags ?? []) {
      this.close(tag);
    }
    if (payload.messageId) {
      this.closeByMessageId(payload.messageId);
    }
    if (payload.maxMessageId) {
      for (const [tag, entry] of this.activeNotifications.entries()) {
        if (
          this.matchesReadThrough(entry, payload) &&
          entry.messageId &&
          isUuidAtOrBefore(entry.messageId, payload.maxMessageId)
        ) {
          this.close(tag);
        }
      }
    }
  }

  private matchesReadThrough(
    entry: ActiveNotificationEntry,
    payload: TDesktopNotificationDismiss,
  ): boolean {
    const data = entry.data;
    if (!data || data.type === 'reaction') {
      return false;
    }
    if (payload.roomId) {
      return data.roomId === payload.roomId;
    }
    return (
      Boolean(payload.recipientId) &&
      data.type === 'direct-message' &&
      data.senderId === payload.recipientId
    );
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

export function dismissNotification(
  payload: TDesktopNotificationDismiss,
): void {
  defaultNotificationManager.dismiss(payload);
}

export function updateNotification(payload: TDesktopNotificationUpdate): void {
  defaultNotificationManager.update(payload, null);
}
