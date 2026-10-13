import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { TPushNotificationPayload } from '@konvoez/shared';
import { DesktopBridgeService } from '@core/desktop/desktop-bridge.service';
import { NotificationNavigationService } from './notification-navigation.service';

describe('NotificationNavigationService', () => {
  let routerMock: { navigateByUrl: ReturnType<typeof vi.fn> };
  let notificationClicks$: Subject<{
    action: string;
    notification: NotificationOptions & { title: string };
  }>;
  let swPushMock: {
    isEnabled: boolean;
    notificationClicks: typeof notificationClicks$;
  };
  let desktopClickListener:
    ((payload: TPushNotificationPayload) => void) | null = null;
  let desktopOffMock: ReturnType<typeof vi.fn>;
  let desktopBridgeMock: {
    isDesktop: boolean;
    onNotificationClick: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    desktopClickListener = null;
    desktopOffMock = vi.fn();
    notificationClicks$ = new Subject();

    routerMock = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    swPushMock = {
      isEnabled: true,
      notificationClicks: notificationClicks$,
    };

    desktopBridgeMock = {
      isDesktop: false,
      onNotificationClick: vi.fn((listener) => {
        desktopClickListener = listener;
        return desktopOffMock;
      }),
    };
  });

  const setupTestBed = () => {
    TestBed.configureTestingModule({
      providers: [
        NotificationNavigationService,
        { provide: Router, useValue: routerMock },
        { provide: SwPush, useValue: swPushMock },
        { provide: DesktopBridgeService, useValue: desktopBridgeMock },
      ],
    });
    return TestBed.inject(NotificationNavigationService);
  };

  describe('Web Push notification clicks', () => {
    it('navigates when SwPush notificationClicks emits a notification with a valid url', () => {
      const service = setupTestBed();
      service.init();

      notificationClicks$.next({
        action: '',
        notification: {
          title: 'Alice',
          data: {
            url: '/direct/42',
            senderId: 42,
          },
        },
      });

      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/direct/42');
    });

    it('falls back to resolving url from onActionClick or senderId if url is absent', () => {
      const service = setupTestBed();
      service.init();

      notificationClicks$.next({
        action: '',
        notification: {
          title: 'Alice',
          data: {
            senderId: 77,
            type: 'direct-message',
          },
        },
      });

      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/direct/77');
    });

    it('navigates to action-specific url when a specific action button was clicked', () => {
      const service = setupTestBed();
      service.init();

      notificationClicks$.next({
        action: 'call',
        notification: {
          title: 'Alice',
          data: {
            url: '/direct/42',
            onActionClick: {
              default: {
                operation: 'focusLastFocusedOrOpen',
                url: '/direct/42',
              },
              call: {
                operation: 'focusLastFocusedOrOpen',
                url: '/direct/42?action=call',
              },
            },
          },
        },
      });

      expect(routerMock.navigateByUrl).toHaveBeenCalledWith(
        '/direct/42?action=call',
      );
    });

    it('does not navigate when notification has no resolvable url', () => {
      const service = setupTestBed();
      service.init();

      notificationClicks$.next({
        action: '',
        notification: {
          title: 'Unknown',
          data: {},
        },
      });

      expect(routerMock.navigateByUrl).not.toHaveBeenCalled();
    });

    it('does not subscribe to SwPush if swPush.isEnabled is false', () => {
      swPushMock.isEnabled = false;
      const service = setupTestBed();
      service.init();

      expect(notificationClicks$.observed).toBe(false);
    });
  });

  describe('Desktop notification clicks', () => {
    beforeEach(() => {
      desktopBridgeMock.isDesktop = true;
    });

    it('navigates when desktop bridge emits a notification click', () => {
      const service = setupTestBed();
      service.init();

      expect(desktopBridgeMock.onNotificationClick).toHaveBeenCalledTimes(1);
      expect(desktopClickListener).toBeDefined();

      desktopClickListener?.({
        title: 'Bob',
        body: 'Incoming call...',
        data: {
          url: '/direct/10',
          callerId: 10,
        },
      });

      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/direct/10');
    });

    it('does not navigate when desktop notification click has no resolvable url', () => {
      const service = setupTestBed();
      service.init();

      desktopClickListener?.({
        title: 'System',
        body: 'Alert',
      });

      expect(routerMock.navigateByUrl).not.toHaveBeenCalled();
    });

    it('unregisters listener when destroyed', () => {
      const service = setupTestBed();
      service.init();

      TestBed.resetTestingModule();
      expect(desktopOffMock).toHaveBeenCalled();
    });
  });

  it('init() is idempotent and does not register duplicate listeners', () => {
    desktopBridgeMock.isDesktop = true;
    const service = setupTestBed();
    service.init();
    service.init();

    expect(desktopBridgeMock.onNotificationClick).toHaveBeenCalledTimes(1);
  });
});
