import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsApiService } from './notifications-api.service';
import { DEFAULT_USER_NOTIFICATION_SETTINGS } from '@konvoez/shared';

describe('NotificationsApiService', () => {
  it('calls GET /notifications/settings with credentials', () => {
    const get = vi.fn().mockReturnValue(of(DEFAULT_USER_NOTIFICATION_SETTINGS));
    TestBed.configureTestingModule({
      providers: [
        NotificationsApiService,
        { provide: HttpClient, useValue: { get } },
      ],
    });

    const service = TestBed.inject(NotificationsApiService);
    service.getSettings().subscribe();

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/settings'),
      { withCredentials: true },
    );
  });

  it('calls PATCH /notifications/settings with payload and credentials', () => {
    const patch = vi
      .fn()
      .mockReturnValue(of(DEFAULT_USER_NOTIFICATION_SETTINGS));
    TestBed.configureTestingModule({
      providers: [
        NotificationsApiService,
        { provide: HttpClient, useValue: { patch } },
      ],
    });

    const service = TestBed.inject(NotificationsApiService);
    const payload = { directMessages: false };
    service.updateSettings(payload).subscribe();

    expect(patch).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/settings'),
      payload,
      { withCredentials: true },
    );
  });
});
