import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  NgZone,
} from '@angular/core';
import { TUI_SCROLL_REF } from '@taiga-ui/core';

import {
  gestureDirection,
  nestedScrollBlocksPull,
  type GestureDirection,
} from './pull-to-refresh';

/**
 * Taiga pull-to-refresh treats its scroll ref as the page scroller and, while
 * that ref is at the top, sets `touch-action: pan-down` on it. The shell does
 * not scroll: pages scroll inside it. A detached probe element stands in for
 * the scroller, so that style stays off the document, and its `scrollTop`
 * tells Taiga to ignore a pull that starts inside a nested list which is not
 * at its visual top.
 * A gesture that starts in such a way is cancelled (`touchmove`
 * `preventDefault`, so iOS does not rubber-band the viewport) only once it is
 * recognised as a single-finger vertical pull down. Any other gesture (scroll
 * up, horizontal swipe, pinch) is left to the browser.
 */
@Directive({
  selector: '[appPullToRefresh]',
  providers: [
    {
      provide: TUI_SCROLL_REF,
      useFactory: () =>
        new ElementRef(createPullToRefreshProbe(inject(DOCUMENT))),
    },
  ],
})
export class PullToRefreshDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly scrollRef = inject<ElementRef<HTMLElement>>(TUI_SCROLL_REF);

  private armed = false;
  private direction: GestureDirection = 'undecided';
  private startX = 0;
  private startY = 0;

  private readonly onTouchStart = (event: Event): void => {
    if (!isTouchEvent(event)) {
      return;
    }
    const touch = event.touches[0];
    const target = event.target;
    const blocked =
      target instanceof Node &&
      nestedScrollBlocksPull(target, this.host.nativeElement);
    this.armed = !blocked && event.touches.length === 1 && !!touch;
    this.direction = 'undecided';
    this.startX = touch?.clientX ?? 0;
    this.startY = touch?.clientY ?? 0;
    this.scrollRef.nativeElement.scrollTop = blocked ? 1 : 0;
  };

  private readonly disarm = (): void => {
    this.armed = false;
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.armed) {
      return;
    }
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) {
      this.disarm();
      return;
    }
    if (this.direction === 'undecided') {
      this.direction = gestureDirection(
        touch.clientX - this.startX,
        touch.clientY - this.startY,
      );
    }
    if (this.direction === 'other') {
      this.disarm();
      return;
    }
    if (this.direction === 'down' && event.cancelable) {
      event.preventDefault();
    }
  };

  constructor() {
    const host = this.host.nativeElement;
    // Angular host bindings cannot register capture or non-passive listeners.
    this.ngZone.runOutsideAngular(() => {
      host.addEventListener('touchstart', this.onTouchStart, { capture: true });
      host.addEventListener('touchend', this.disarm, { capture: true });
      host.addEventListener('touchcancel', this.disarm, { capture: true });
      host.addEventListener('touchmove', this.onTouchMove, { passive: false });
    });
    this.destroyRef.onDestroy(() => {
      host.removeEventListener('touchstart', this.onTouchStart, true);
      host.removeEventListener('touchend', this.disarm, true);
      host.removeEventListener('touchcancel', this.disarm, true);
      host.removeEventListener('touchmove', this.onTouchMove);
    });
  }
}

function isTouchEvent(event: Event): event is TouchEvent {
  return 'touches' in event;
}

/**
 * The probe is never attached to the document: Taiga only reads `scrollTop`,
 * sets styles and listens for `scroll` on it. `scrollTop` of a detached
 * element is always 0, so it is replaced with a plain writable value.
 */
function createPullToRefreshProbe(document: Document): HTMLElement {
  const probe = document.createElement('div');
  let offset = 0;
  Object.defineProperty(probe, 'scrollTop', {
    get: () => offset,
    set: (value: number) => {
      offset = value;
    },
  });
  return probe;
}
