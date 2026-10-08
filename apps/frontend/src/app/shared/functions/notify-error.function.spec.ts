import { describe, expect, it, vi } from 'vitest';
import { EVoiceRoomErrorCode } from '@konvoez/shared';
import { notifyError } from './notify-error.function';

describe('notifyError', () => {
  it('maps known server errors to translation keys', () => {
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    };
    const translate = {
      instant: vi.fn((key: string) => key),
    };

    notifyError(
      notifications as never,
      translate as never,
      'CALL.CAMERA_FAILED',
      new Error(EVoiceRoomErrorCode.VIDEO_LIMIT_REACHED),
    );

    expect(translate.instant).toHaveBeenCalledWith('CALL.VIDEO_LIMIT_REACHED');
    expect(notifications.open).toHaveBeenCalledWith(
      'CALL.VIDEO_LIMIT_REACHED',
      expect.objectContaining({ appearance: 'negative' }),
    );
  });

  it('uses the fallback key when the error is unknown', () => {
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    };
    const translate = {
      instant: vi.fn((key: string) => key),
    };

    notifyError(
      notifications as never,
      translate as never,
      'CALL.CAMERA_FAILED',
      new Error('other'),
    );

    expect(translate.instant).toHaveBeenCalledWith('CALL.CAMERA_FAILED');
  });

  it('logs to console.error when error is provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* noop */
    });
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    };
    const translate = {
      instant: vi.fn((key: string) => key),
    };
    const err = new Error('boom');

    notifyError(
      notifications as never,
      translate as never,
      'CALL.CAMERA_FAILED',
      err,
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('CALL.CAMERA_FAILED', err);
  });

  it('does not log to console.error when error is omitted', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* noop */
    });
    const notifications = {
      open: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    };
    const translate = {
      instant: vi.fn((key: string) => key),
    };

    notifyError(
      notifications as never,
      translate as never,
      'VOICE.ROOM_CLOSED',
    );

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
