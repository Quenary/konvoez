import { describe, expect, it, vi } from 'vitest';
import { ApiErrorCode } from '@konvoez/shared';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { notifyError } from './notify-error.function';

describe('notifyError', () => {
  it('maps known server errors to translation keys', () => {
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as unknown as TuiNotificationService;
    const translate = {
      instant: vi.fn((key: string) => key),
    } as unknown as TranslateService;

    notifyError(
      notifications,
      translate,
      'CALL.CAMERA_FAILED',
      new Error(ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED),
    );

    expect(translate.instant).toHaveBeenCalledWith(
      'ERRORS.VOICE_VIDEO_LIMIT_REACHED',
    );
    expect(notifications.open).toHaveBeenCalledWith(
      'ERRORS.VOICE_VIDEO_LIMIT_REACHED',
      expect.objectContaining({ appearance: 'negative' }),
    );
  });

  it('uses the fallback key when the error is unknown', () => {
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as unknown as TuiNotificationService;
    const translate = {
      instant: vi.fn((key: string) => key),
    } as unknown as TranslateService;

    notifyError(
      notifications,
      translate,
      'CALL.CAMERA_FAILED',
      new Error('other'),
    );

    expect(translate.instant).toHaveBeenCalledWith('CALL.CAMERA_FAILED');
  });

  it('uses the fallback key when the error code is generic', () => {
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as unknown as TuiNotificationService;
    const translate = {
      instant: vi.fn((key: string) => key),
    } as unknown as TranslateService;

    notifyError(
      notifications,
      translate,
      'ROOMS.LOAD_FAILED',
      new Error(ApiErrorCode.INTERNAL),
    );

    expect(translate.instant).toHaveBeenCalledWith('ROOMS.LOAD_FAILED');
  });

  it('logs to console.error when error is provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* noop */
    });
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as unknown as TuiNotificationService;
    const translate = {
      instant: vi.fn((key: string) => key),
    } as unknown as TranslateService;
    const err = new Error('boom');

    notifyError(notifications, translate, 'CALL.CAMERA_FAILED', err);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('CALL.CAMERA_FAILED', err);
  });

  it('does not log to console.error when error is omitted', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* noop */
    });
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as unknown as TuiNotificationService;
    const translate = {
      instant: vi.fn((key: string) => key),
    } as unknown as TranslateService;

    notifyError(notifications, translate, 'VOICE.ROOM_CLOSED');

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
