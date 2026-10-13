import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import type { TPushNotificationData } from '@konvoez/shared';
import { DesktopBridgeService } from '@core/desktop/desktop-bridge.service';
import { resolveNotificationUrl } from './resolve-notification-url';

@Injectable({ providedIn: 'root' })
export class NotificationNavigationService {
  private readonly router = inject(Router);
  private readonly swPush = inject(SwPush);
  private readonly desktopBridgeService = inject(DesktopBridgeService);
  private readonly destroyRef = inject(DestroyRef);

  private initialized = false;

  public init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (this.swPush.isEnabled) {
      this.swPush.notificationClicks
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ notification }) => {
          this.handleNotificationData(
            notification?.data as TPushNotificationData | undefined,
          );
        });
    }

    if (this.desktopBridgeService.isDesktop) {
      const off = this.desktopBridgeService.onNotificationClick((payload) => {
        this.handleNotificationData(payload?.data);
      });
      if (off) {
        this.destroyRef.onDestroy(() => off());
      }
    }
  }

  private handleNotificationData(data?: TPushNotificationData | null): void {
    const url = resolveNotificationUrl(data);
    if (url) {
      void this.router.navigateByUrl(url);
    }
  }
}
