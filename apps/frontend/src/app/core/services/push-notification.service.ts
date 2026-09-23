import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { TPushSubscription } from '@konvoez/shared';
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

export type PushToggleResult =
  'enabled' | 'disabled' | 'unsupported' | 'permission-denied' | 'failed';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly swPush = inject(SwPush);
  private readonly notificationsApiService = inject(NotificationsApiService);
  private readonly subscriptionState = signal<PushSubscription | null>(null);
  private readonly permissionState = signal<NotificationPermission>(
    this.readPermission(),
  );

  public readonly subscription = this.subscriptionState.asReadonly();
  public readonly isEnabled = computed(
    () =>
      this.isSupported() &&
      this.permissionState() === 'granted' &&
      this.subscription() !== null,
  );

  constructor() {
    if (!this.swPush.isEnabled) {
      return;
    }

    this.swPush.subscription
      .pipe(takeUntilDestroyed())
      .subscribe((subscription) => {
        this.subscriptionState.set(subscription);
      });
  }

  public isSupported(): boolean {
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

        return this.notificationsApiService
          .createSubscription(this.toApiPayload(subscription))
          .pipe(
            map(() => true),
            catchError(() => of(false)),
          );
      }),
    );
  }

  private subscribe(): Observable<PushToggleResult> {
    return this.notificationsApiService.getPublicKey().pipe(
      switchMap(({ publicKey }) => {
        if (!publicKey) {
          return throwError(() => new Error('VAPID public key is empty'));
        }

        return from(
          this.swPush.requestSubscription({
            serverPublicKey: publicKey,
          }),
        );
      }),
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
