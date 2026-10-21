import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaDeviceSwitchNotifierService } from './media-device-switch-notifier.service';

describe('MediaDeviceSwitchNotifierService', () => {
  let open: ReturnType<typeof vi.fn>;
  let instant: ReturnType<typeof vi.fn>;
  let service: MediaDeviceSwitchNotifierService;

  beforeEach(() => {
    open = vi.fn().mockReturnValue(of(undefined));
    instant = vi.fn(
      (key: string, params?: { label?: string }) =>
        `${key}${params?.label ? `:${params.label}` : ''}`,
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: TuiNotificationService, useValue: { open } },
        { provide: TranslateService, useValue: { instant } },
      ],
    });
    service = TestBed.inject(MediaDeviceSwitchNotifierService);
  });

  it('shows an info toast with the new device label', () => {
    service.notify('audioinput', 'USB mic');

    expect(instant).toHaveBeenCalledWith(
      'SETTINGS.DEVICES.AUTO_SWITCHED_AUDIO_INPUT',
      { label: 'USB mic' },
    );
    expect(open).toHaveBeenCalledWith(
      'SETTINGS.DEVICES.AUTO_SWITCHED_AUDIO_INPUT:USB mic',
      { appearance: 'info', autoClose: 5000, closable: true },
    );
  });

  it('uses a placeholder when the label is hidden', () => {
    service.notify('videoinput', '');

    expect(instant).toHaveBeenCalledWith('SETTINGS.DEVICES.UNKNOWN_DEVICE');
    expect(open.mock.calls[0][0]).toBe(
      'SETTINGS.DEVICES.AUTO_SWITCHED_VIDEO_INPUT:SETTINGS.DEVICES.UNKNOWN_DEVICE',
    );
  });
});
