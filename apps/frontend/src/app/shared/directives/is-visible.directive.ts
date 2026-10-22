import {
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Emits whether the host element is visible inside `appIsVisibleRoot` (the
 * viewport when it is null). Emits on every change of the visibility state;
 * the first observation is always emitted.
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
      const threshold = this.appIsVisibleThreshold();
      const root = this.appIsVisibleRoot();
      this.observe(threshold, root);
    });

    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  private observe(threshold: number, root: Element | null): void {
    this.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) {
          return;
        }
        const visible =
          entry.isIntersecting && entry.intersectionRatio >= threshold;
        if (visible !== this.visible) {
          this.visible = visible;
          this.appIsVisible.emit(visible);
        }
      },
      {
        root,
        threshold,
      },
    );
    this.observer.observe(this.el.nativeElement);
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
