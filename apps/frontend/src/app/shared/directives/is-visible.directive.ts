import {
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { TUI_SCROLL_REF } from '@taiga-ui/core';

/**
 * Emits whether the host element is visible inside the nearest Taiga scroll
 * container (the viewport when there is none). Emits on every change of the
 * visibility state; the first observation is always emitted.
 */
@Directive({
  selector: '[appIsVisible]',
})
export class IsVisibleDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scrollRef = inject(TUI_SCROLL_REF, { optional: true });

  /** Share of the element that must be visible to count as visible. */
  readonly appIsVisibleThreshold = input<number>(0.5);

  readonly appIsVisible = output<boolean>();

  private observer: IntersectionObserver | null = null;
  private visible: boolean | null = null;

  constructor() {
    effect(() => {
      const threshold = this.appIsVisibleThreshold();
      this.observe(threshold);
    });

    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  private observe(threshold: number): void {
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
        root: this.scrollRef?.nativeElement ?? null,
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
