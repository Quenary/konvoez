import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
  type Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import {
  ENotificationsEvent,
  isUuidAtOrBefore,
  notificationDismissPayloadSchema,
  notificationUpdatePayloadSchema,
  pushNotificationDataSchema,
  TPushSubscription,
  type TNotificationUpdatePayload,
  type TNotificationsDismissPayload,
  type TPushNotificationData,
} from '@konvoez/shared';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import {
  Observable,
  catchError,
  from,
  map,
  of,
  switchMap,
  take,
  tap,
  throwError,
} from 'rxjs';
import { NotificationsApiService } from './notifications-api.service';
import { DesktopBridgeService } from '@core/desktop/desktop-bridge.service';
import { NotificationsSocketToken } from '@core/tokens/notifications-socket.token';

export type PushToggleResult =
  | 'enabled'
  | 'disabled'
  | 'unsupported'
  | 'permission-denied'
  | 'failed'
  | 'server-disabled';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly swPush = inject(SwPush);
  private readonly notificationsApiService = inject(NotificationsApiService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly desktopBridgeService = inject(DesktopBridgeService);
  private readonly notificationsSocket = inject(NotificationsSocketToken);
  private readonly destroyRef = inject(DestroyRef);

  public readonly subscription: Signal<PushSubscription | null>;
  public readonly serverKeyLoaded = computed(
    () => this.serverPublicKey() !== undefined,
  );
  public readonly serverAvailable = computed(
    () =>
      this.serverPublicKey() !== null && this.serverPublicKey() !== undefined,
  );
  public readonly isEnabled = computed(
    () =>
      this.isSupported() &&
      this.permissionState() === 'granted' &&
      this.subscription() !== null,
  );

  private readonly subscriptionState = signal<PushSubscription | null>(null);
  private readonly permissionState = signal<NotificationPermission>(
    this.readPermission(),
  );
  private readonly serverPublicKey = signal<string | null | undefined>(
    undefined,
  );

  constructor() {
    this.subscription = this.subscriptionState.asReadonly();

    const onDismiss = (payload: TNotificationsDismissPayload) => {
      void closeLocalNotifications(payload);
    };
    const onUpdate = (payload: TNotificationUpdatePayload) => {
      void updateLocalNotification(payload);
    };
    this.notificationsSocket.on(
      ENotificationsEvent.NOTIFICATION_DISMISS,
      onDismiss,
    );
    this.notificationsSocket.on(
      ENotificationsEvent.NOTIFICATION_UPDATE,
      onUpdate,
    );
    this.destroyRef.onDestroy(() => {
      this.notificationsSocket.off(
        ENotificationsEvent.NOTIFICATION_DISMISS,
        onDismiss,
      );
      this.notificationsSocket.off(
        ENotificationsEvent.NOTIFICATION_UPDATE,
        onUpdate,
      );
    });

    if (!this.swPush.isEnabled) {
      return;
    }

    this.swPush.subscription
      .pipe(takeUntilDestroyed())
      .subscribe((subscription) => {
        this.subscriptionState.set(subscription);
      });

    this.swPush.messages
      ?.pipe(takeUntilDestroyed())
      .subscribe((msg: unknown) => {
        if (typeof msg !== 'object' || msg === null) {
          return;
        }
        const action = Reflect.get(msg, 'action');
        if (action === 'dismiss') {
          const dismissal = notificationDismissPayloadSchema.safeParse(msg);
          if (dismissal.success) {
            void closeLocalNotifications(dismissal.data);
          }
        } else if (action === 'update') {
          const notification = notificationUpdatePayloadSchema.safeParse(
            Reflect.get(msg, 'notification'),
          );
          if (notification.success) {
            void updateLocalNotification(notification.data);
          }
        }
      });
  }

  public isSupported(): boolean {
    if (this.desktopBridgeService.isDesktop) {
      return false;
    }
    return (
      this.swPush.isEnabled &&
      window.isSecureContext &&
      'Notification' in window &&
      'serviceWorker' in navigator
    );
  }

  public enable(): Observable<PushToggleResult> {
    if (!this.isSupported()) {
      return of('unsupported');
    }

    return from(Notification.requestPermission()).pipe(
      switchMap((permission) => {
        this.permissionState.set(permission);

        if (permission !== 'granted') {
          return of('permission-denied' as const);
        }

        return this.subscribe();
      }),
      catchError(() => of('failed' as const)),
    );
  }

  public disable(): Observable<PushToggleResult> {
    const subscription = this.subscriptionState();
    if (!subscription) {
      return of('disabled');
    }

    const endpoint = subscription.endpoint;

    return from(this.swPush.unsubscribe()).pipe(
      tap(() => this.subscriptionState.set(null)),
      switchMap(() =>
        this.notificationsApiService.unsubscribe({ endpoint }).pipe(
          map(() => 'disabled' as const),
          catchError(() => of('failed' as const)),
        ),
      ),
      catchError(() => of('failed' as const)),
    );
  }

  /**
   * Show a toast for a failed toggle result; no-op on success.
   */
  public notifyToggleError(
    result: PushToggleResult,
    action: 'enable' | 'disable',
  ): void {
    const key = this.toggleErrorKey(result, action);
    if (!key) {
      return;
    }

    this.tuiNotificationsService
      .open(this.translateService.instant(key), {
        appearance: 'negative',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();
  }

  public loadServerKey(): Observable<string | null> {
    return this.notificationsApiService.getPublicKey().pipe(
      tap(({ publicKey }) => {
        this.serverPublicKey.set(publicKey ?? null);
      }),
      map(({ publicKey }) => publicKey ?? null),
      catchError(() => {
        this.serverPublicKey.set(null);
        return of(null);
      }),
    );
  }

  public syncExistingSubscription(): Observable<boolean> {
    if (!this.isSupported()) {
      return of(false);
    }

    return this.swPush.subscription.pipe(
      take(1),
      tap((subscription) => this.subscriptionState.set(subscription)),
      switchMap((subscription) => {
        if (!subscription) {
          return of(false);
        }

        return this.loadServerKey().pipe(
          switchMap((publicKey) => {
            if (!publicKey) {
              return of(false);
            }
            const current = subscription.options.applicationServerKey;
            const matches =
              current !== null && arrayBufferToBase64Url(current) === publicKey;
            if (matches) {
              return this.notificationsApiService
                .createSubscription(this.toApiPayload(subscription))
                .pipe(
                  map(() => true),
                  catchError(() => of(false)),
                );
            }

            const endpoint = subscription.endpoint;
            return from(subscription.unsubscribe()).pipe(
              tap(() => this.subscriptionState.set(null)),
              switchMap(() =>
                this.notificationsApiService
                  .unsubscribe({ endpoint })
                  .pipe(catchError(() => of(null))),
              ),
              switchMap(() => this.subscribe()),
              map((result) => result === 'enabled'),
            );
          }),
          catchError(() => of(false)),
        );
      }),
    );
  }

  private toggleErrorKey(
    result: PushToggleResult,
    action: 'enable' | 'disable',
  ): string | null {
    switch (result) {
      case 'enabled':
      case 'disabled':
        return null;
      case 'permission-denied':
        return 'SETTINGS.NOTIFICATIONS.PERMISSION_DENIED';
      case 'unsupported':
        return 'SETTINGS.NOTIFICATIONS.UNSUPPORTED';
      case 'failed':
        return action === 'enable'
          ? 'SETTINGS.NOTIFICATIONS.ENABLE_ERROR'
          : 'SETTINGS.NOTIFICATIONS.DISABLE_ERROR';
      case 'server-disabled':
        return 'SETTINGS.NOTIFICATIONS.SERVER_DISABLED';
    }
  }

  private subscribe(): Observable<PushToggleResult> {
    return this.loadServerKey().pipe(
      switchMap((publicKey) => {
        if (!publicKey) {
          return of('server-disabled' as const);
        }

        return from(
          this.swPush.requestSubscription({
            serverPublicKey: publicKey,
          }),
        ).pipe(
          switchMap((subscription) =>
            this.notificationsApiService
              .createSubscription(this.toApiPayload(subscription))
              .pipe(
                tap(() => this.subscriptionState.set(subscription)),
                map(() => 'enabled' as const),
                catchError((error: unknown) =>
                  from(subscription.unsubscribe()).pipe(
                    tap(() => this.subscriptionState.set(null)),
                    switchMap(() => throwError(() => error)),
                  ),
                ),
              ),
          ),
        );
      }),
    );
  }

  private readPermission(): NotificationPermission {
    return 'Notification' in window ? Notification.permission : 'denied';
  }

  private toApiPayload(subscription: PushSubscription): TPushSubscription {
    const json = subscription.toJSON();

    return {
      endpoint: json.endpoint ?? subscription.endpoint,
      keys: {
        p256dh: json.keys?.['p256dh'] ?? '',
        auth: json.keys?.['auth'] ?? '',
      },
      userAgent: navigator.userAgent,
    };
  }
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function closeLocalNotifications(
  filter: TNotificationsDismissPayload,
): Promise<void> {
  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.ready
  ) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const notifications = await reg.getNotifications();
      for (const notification of notifications) {
        const data = asNotificationData(notification.data);
        const directMatch = filter.tag
          ? notification.tag === filter.tag
          : (filter.tags?.includes(notification.tag) ??
            (filter.messageId ? data?.messageId === filter.messageId : false));
        const matches =
          directMatch ||
          Boolean(
            filter.maxMessageId &&
            data &&
            isReadThroughNotification(data, filter),
          );
        if (matches) {
          notification.close();
        }
      }
    } catch (error) {
      console.warn('Failed to close local notifications', error);
    }
  }
}

export async function updateLocalNotification(
  payload: TNotificationUpdatePayload,
): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker.ready
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = (await registration.getNotifications()).find(
      (notification) => notification.tag === payload.tag,
    );
    if (!existing) {
      return;
    }

    await registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      tag: payload.tag,
      data: payload.data,
      silent: true,
    });
  } catch (error) {
    console.warn('Failed to update local notification', error);
  }
}

function asNotificationData(value: unknown): TPushNotificationData | null {
  const parsed = pushNotificationDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isReadThroughNotification(
  data: TPushNotificationData,
  filter: TNotificationsDismissPayload,
): boolean {
  if (data.type === 'reaction' || !data.messageId || !filter.maxMessageId) {
    return false;
  }

  const belongsToChat = filter.roomId
    ? data.roomId === filter.roomId
    : data.type === 'direct-message' && data.senderId === filter.recipientId;

  return belongsToChat && isUuidAtOrBefore(data.messageId, filter.maxMessageId);
}
