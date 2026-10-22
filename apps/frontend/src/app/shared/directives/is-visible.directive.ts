import {
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

/** Dense steps keep the callback firing while a tall host scrolls through. */
const OBSERVER_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * Emits whether the host element is visible inside `appIsVisibleRoot` (the
 * viewport when it is null). Emits on every change of the visibility state;
 * the first observation is always emitted.
 *
 * The visible share is measured against the part of the host that fits in
 * the root, so a host taller than the root counts as visible once it covers
 * enough of it.
 */
@Directive({
  selector: '[appIsVisible]',
})
export class IsVisibleDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Share of the element that must be visible to count as visible. */
  readonly appIsVisibleThreshold = input<number>(0.5);

  /** Intersection root, usually the scroll container; null is the viewport. */
  readonly appIsVisibleRoot = input<Element | null>(null);

  readonly appIsVisible = output<boolean>();

  private observer: IntersectionObserver | null = null;
  private visible: boolean | null = null;

  constructor() {
    effect(() => {
      const root = this.appIsVisibleRoot();
      this.observe(root);
    });

    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  private observe(root: Element | null): void {
    this.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) {
          return;
        }
        const visible =
          entry.isIntersecting &&
          visibleShare(entry) >= this.appIsVisibleThreshold();
        if (visible !== this.visible) {
          this.visible = visible;
          this.appIsVisible.emit(visible);
        }
      },
      {
        root,
        threshold: OBSERVER_THRESHOLDS,
      },
    );
    this.observer.observe(this.el.nativeElement);
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

function visibleShare(entry: IntersectionObserverEntry): number {
  const hostHeight = entry.boundingClientRect.height;
  const fit = Math.min(hostHeight, entry.rootBounds?.height ?? hostHeight);
  return fit > 0 ? entry.intersectionRect.height / fit : 0;
}
