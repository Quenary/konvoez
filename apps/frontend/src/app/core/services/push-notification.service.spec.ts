import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BehaviorSubject, firstValueFrom, of, throwError } from 'rxjs';
import { NotificationsApiService } from './notifications-api.service';
import { PushNotificationService } from './push-notification.service';

describe('PushNotificationService', () => {
  const vapidPublicKey =
    'BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE';

  const mockSubscription = {
    endpoint: 'https://push.example/abc',
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: vi.fn(() => ({
      endpoint: 'https://push.example/abc',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    })),
  } as unknown as PushSubscription;

  const subscriptionSubject = new BehaviorSubject<PushSubscription | null>(
    null,
  );

  const swPush = {
    isEnabled: true,
    requestSubscription: vi.fn().mockResolvedValue(mockSubscription),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    subscription: subscriptionSubject.asObservable(),
  };

  const notificationsApiService = {
    getPublicKey: vi.fn(() => of({ publicKey: vapidPublicKey })),
    createSubscription: vi.fn(() => of(undefined)),
    unsubscribe: vi.fn(() => of(undefined)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionSubject.next(null);
    if (!('Notification' in globalThis)) {
      Object.defineProperty(globalThis, 'Notification', {
        configurable: true,
        value: {
          permission: 'granted',
          requestPermission: vi.fn().mockResolvedValue('granted'),
        },
      });
    } else {
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        value: 'granted',
      });
      Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    }
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    swPush.isEnabled = true;
    swPush.requestSubscription.mockResolvedValue(mockSubscription);
    swPush.unsubscribe.mockResolvedValue(undefined);
    (
      mockSubscription.unsubscribe as ReturnType<typeof vi.fn>
    ).mockResolvedValue(true);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });

    TestBed.configureTestingModule({
      providers: [
        PushNotificationService,
        { provide: SwPush, useValue: swPush },
        { provide: NotificationsApiService, useValue: notificationsApiService },
      ],
    });
  });

  it('should require an enabled Angular service worker', () => {
    const service = TestBed.inject(PushNotificationService);

    swPush.isEnabled = false;
    expect(service.isSupported()).toBe(false);
  });

  it('should require a secure context', () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    const service = TestBed.inject(PushNotificationService);

    expect(service.isSupported()).toBe(false);
  });

  it('should enable via SwPush with the raw VAPID public key', async () => {
    const service = TestBed.inject(PushNotificationService);

    await expect(firstValueFrom(service.enable())).resolves.toBe('enabled');

    expect(swPush.requestSubscription).toHaveBeenCalledWith({
      serverPublicKey: vapidPublicKey,
    });
    expect(notificationsApiService.createSubscription).toHaveBeenCalledWith({
      endpoint: mockSubscription.endpoint,
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
      userAgent: expect.any(String),
    });
    expect(service.subscription()).toBe(mockSubscription);
    expect(service.isEnabled()).toBe(true);
  });

  it('should return permission-denied when the user rejects notifications', async () => {
    Notification.requestPermission = vi.fn().mockResolvedValue('denied');
    const service = TestBed.inject(PushNotificationService);

    await expect(firstValueFrom(service.enable())).resolves.toBe(
      'permission-denied',
    );
    expect(swPush.requestSubscription).not.toHaveBeenCalled();
  });

  it('should disable via SwPush and the server', async () => {
    subscriptionSubject.next(mockSubscription);
    const service = TestBed.inject(PushNotificationService);

    await expect(firstValueFrom(service.disable())).resolves.toBe('disabled');

    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(notificationsApiService.unsubscribe).toHaveBeenCalledWith({
      endpoint: mockSubscription.endpoint,
    });
    expect(service.subscription()).toBeNull();
  });

  it('should succeed when there is no local subscription', async () => {
    const service = TestBed.inject(PushNotificationService);

    await expect(firstValueFrom(service.disable())).resolves.toBe('disabled');
    expect(swPush.unsubscribe).not.toHaveBeenCalled();
    expect(notificationsApiService.unsubscribe).not.toHaveBeenCalled();
  });

  it('should re-register an existing subscription for the current user', async () => {
    subscriptionSubject.next(mockSubscription);
    const service = TestBed.inject(PushNotificationService);

    await expect(
      firstValueFrom(service.syncExistingSubscription()),
    ).resolves.toBe(true);

    expect(notificationsApiService.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: mockSubscription.endpoint,
        userAgent: expect.any(String),
      }),
    );
  });

  it('should not re-register when there is no local subscription', async () => {
    const service = TestBed.inject(PushNotificationService);

    await expect(
      firstValueFrom(service.syncExistingSubscription()),
    ).resolves.toBe(false);
    expect(notificationsApiService.createSubscription).not.toHaveBeenCalled();
  });

  it('should roll back the local subscription if the server save fails', async () => {
    notificationsApiService.createSubscription.mockReturnValueOnce(
      throwError(() => new Error('save failed')),
    );
    const service = TestBed.inject(PushNotificationService);

    await expect(firstValueFrom(service.enable())).resolves.toBe('failed');
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(service.subscription()).toBeNull();
  });
});
