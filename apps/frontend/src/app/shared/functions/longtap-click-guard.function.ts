const LONG_TAP_CLICK_SUPPRESS_MS = 1000;

export interface ILongtapClickGuard {
  arm(): void;
  consume(): boolean;
  destroy(): void;
}

/**
 * Swallows the click that a touch long-press fires after the context menu opens.
 */
export function createLongtapClickGuard(
  isTouch: () => boolean,
): ILongtapClickGuard {
  let suppress = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timer = null;
  };

  return {
    arm(): void {
      if (!isTouch()) {
        return;
      }
      suppress = true;
      clearTimer();
      timer = setTimeout(() => {
        suppress = false;
        timer = null;
      }, LONG_TAP_CLICK_SUPPRESS_MS);
    },
    consume(): boolean {
      if (!suppress) {
        return false;
      }
      suppress = false;
      clearTimer();
      return true;
    },
    destroy(): void {
      suppress = false;
      clearTimer();
    },
  };
}
