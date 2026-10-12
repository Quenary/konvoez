import { describe, expect, it } from 'vitest';
import {
  isDisplayMediaAudioConstraintsAbortError,
  isDisplayMediaUserCancellation,
} from './display-media-error.utils';

describe('display-media-error.utils', () => {
  describe('isDisplayMediaAudioConstraintsAbortError', () => {
    it('detects loopback constraint failures', () => {
      const error = new DOMException(
        'Invalid capture constraints',
        'AbortError',
      );
      expect(isDisplayMediaAudioConstraintsAbortError(error)).toBe(true);
    });

    it('ignores user cancellation AbortErrors', () => {
      const error = new DOMException('User cancelled', 'AbortError');
      expect(isDisplayMediaAudioConstraintsAbortError(error)).toBe(false);
    });
  });

  describe('isDisplayMediaUserCancellation', () => {
    it('treats NotAllowedError as cancellation', () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');
      expect(isDisplayMediaUserCancellation(error)).toBe(true);
    });

    it('treats picker dismissal AbortErrors as cancellation', () => {
      const error = new DOMException('Permission dismissed', 'AbortError');
      expect(isDisplayMediaUserCancellation(error)).toBe(true);
    });

    it('does not treat audio constraint AbortErrors as cancellation', () => {
      const error = new DOMException(
        'Invalid capture constraints',
        'AbortError',
      );
      expect(isDisplayMediaUserCancellation(error)).toBe(false);
    });
  });
});
