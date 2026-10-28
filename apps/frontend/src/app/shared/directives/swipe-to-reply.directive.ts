import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
} from '@angular/core';

const REACTION_THRESHOLD_DEFAULT = 50;
const MAX_TRANSLATION_DEFAULT = 72;
const DIRECTION_SLOP = 6;
const SPRING_DURATION_MS = 250;

/** User mentions open a profile and must not also start a reply. */
export const USER_MENTION_SELECTOR =
  'app-mention-chip[data-kind="user"], span[data-type="mention"][data-kind="user"]';

/**
 * Controls that keep their own click or horizontal drag.
 * Shared by the double-click reply and the swipe gesture.
 */
export const REPLY_GESTURE_IGNORE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'audio',
  'video',
  'app-user-avatar',
  '.message-reply',
  'app-chat-message-reactions',
  'app-chat-message-reactions-bar',
  'app-chat-message-attachments',
  '[appWithUserDialog]',
  USER_MENTION_SELECTOR,
].join(', ');

@Directive({
  selector: '[appSwipeToReply]',
})
export class SwipeToReplyDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  public readonly appSwipeToReplyDisabled = input<boolean>(false);
  public readonly appSwipeToReplyThreshold = input<number>(
    REACTION_THRESHOLD_DEFAULT,
  );
  public readonly appSwipeToReplyMax = input<number>(MAX_TRANSLATION_DEFAULT);

  public readonly appSwipeToReply = output<void>();

  private activeTouchId: number | null = null;
  private startX = 0;
  private startY = 0;
  private currentOffset = 0;
  private gestureState: 'idle' | 'undecided' | 'swiping' | 'canceled' = 'idle';
  private hasVibrated = false;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ngZone.runOutsideAngular(() => {
      const host = this.elementRef.nativeElement;
      host.addEventListener('touchstart', this.onTouchStart, {
        passive: true,
      });
    });

    this.destroyRef.onDestroy(() => {
      this.removeListeners();
      if (this.resetTimer !== null) {
        clearTimeout(this.resetTimer);
      }
    });
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (this.appSwipeToReplyDisabled() || event.touches.length !== 1) {
      return;
    }

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(REPLY_GESTURE_IGNORE_SELECTOR)
    ) {
      return;
    }

    const touch = event.touches[0];
    this.activeTouchId = touch.identifier;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.currentOffset = 0;
    this.gestureState = 'undecided';
    this.hasVibrated = false;

    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    const { row, indicator } = this.getElements();
    if (row) {
      row.classList.remove('is-releasing');
    }
    if (indicator) {
      indicator.classList.remove('is-releasing');
    }

    window.addEventListener('touchmove', this.onTouchMove, {
      passive: true,
    });
    window.addEventListener('touchend', this.onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', this.onTouchCancel, {
      passive: true,
    });
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (this.gestureState === 'canceled' || this.gestureState === 'idle') {
      return;
    }

    const touch = this.findActiveTouch(event.touches);
    if (!touch) {
      return;
    }

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

    if (this.gestureState === 'undecided') {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absY > absX && absY > DIRECTION_SLOP) {
        this.gestureState = 'canceled';
        this.removeListeners();
        return;
      }

      if (absX > absY && absX > DIRECTION_SLOP) {
        this.gestureState = 'swiping';
      } else {
        return;
      }
    }

    if (this.gestureState === 'swiping') {
      // Leave the touch uncanceled. iOS will not open the keyboard after
      // preventDefault() on touchmove. Horizontal scrolling stays off because
      // the message uses touch-action: pan-y.
      const threshold = this.appSwipeToReplyThreshold();
      const max = this.appSwipeToReplyMax();
      const sign = Math.sign(dx);
      const absDx = Math.abs(dx);

      const damped =
        absDx <= threshold ? absDx : threshold + (absDx - threshold) * 0.25;
      const offset = sign * Math.min(damped, max);
      this.currentOffset = offset;

      const { row, indicator } = this.getElements();
      if (row) {
        row.style.transform = `translateX(${offset}px)`;
      }

      if (indicator) {
        const progress = Math.min(1, Math.abs(offset) / threshold);
        const isSwipeLeft = offset < 0;

        indicator.classList.toggle('is-right', isSwipeLeft);
        indicator.classList.toggle('is-left', !isSwipeLeft);

        const scale = 0.4 + 0.6 * progress;
        indicator.style.opacity = progress.toFixed(2);
        indicator.style.transform = `translateY(-50%) scale(${scale.toFixed(2)})`;

        const isActive = Math.abs(offset) >= threshold;
        indicator.classList.toggle('is-active', isActive);

        if (isActive && !this.hasVibrated) {
          this.hasVibrated = true;
          this.triggerHaptic();
        } else if (!isActive) {
          this.hasVibrated = false;
        }
      }
    }
  };

  private readonly onTouchEnd = (event: TouchEvent): void => {
    const touch = this.findActiveTouch(event.changedTouches);
    if (this.activeTouchId === null || !touch) {
      return;
    }

    const threshold = this.appSwipeToReplyThreshold();
    const shouldReply =
      this.gestureState === 'swiping' &&
      Math.abs(this.currentOffset) >= threshold;

    if (shouldReply && event.cancelable) {
      // A canceled touchend still counts as the gesture, and iOS then shows
      // the keyboard for the focus that follows. Canceling touchmove does not.
      event.preventDefault();
    }

    if (shouldReply) {
      this.ngZone.run(() => {
        this.appSwipeToReply.emit();
      });
    }

    this.finishGesture();
  };

  private readonly onTouchCancel = (): void => {
    this.finishGesture();
  };

  private finishGesture(): void {
    const { row, indicator } = this.getElements();

    if (row) {
      row.classList.add('is-releasing');
      row.style.transform = '';
    }

    if (indicator) {
      indicator.classList.add('is-releasing');
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateY(-50%) scale(0.4)';
      indicator.classList.remove('is-active');
    }

    this.resetTimer = setTimeout(() => {
      if (row) {
        row.classList.remove('is-releasing');
      }
      if (indicator) {
        indicator.classList.remove('is-releasing', 'is-left', 'is-right');
      }
      this.resetTimer = null;
    }, SPRING_DURATION_MS);

    this.removeListeners();
    this.gestureState = 'idle';
    this.activeTouchId = null;
    this.currentOffset = 0;
    this.hasVibrated = false;
  }

  private removeListeners(): void {
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('touchcancel', this.onTouchCancel);
  }

  private findActiveTouch(touches: TouchList): Touch | null {
    if (this.activeTouchId === null) {
      return null;
    }
    for (let i = 0; i < touches.length; i++) {
      const item = touches.item(i);
      if (item && item.identifier === this.activeTouchId) {
        return item;
      }
    }
    return null;
  }

  private getElements(): {
    row: HTMLElement | null;
    indicator: HTMLElement | null;
  } {
    const host = this.elementRef.nativeElement;
    const row = host.querySelector<HTMLElement>('.message-row');
    const indicator = host.querySelector<HTMLElement>(
      '.message-swipe-indicator',
    );
    return { row, indicator };
  }

  private triggerHaptic(): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore environment-specific vibration errors
      }
    }
  }
}
