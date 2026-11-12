import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/**
 * Service to manage the layout of the application.
 * `isMobile` is a handset. `isSmall` is the next CDK tier.
 * `isNarrow` is either of them.
 *
 * Each flag uses `matches`: `Breakpoints.Handset` is two queries joined by a
 * comma, and the observer splits those into separate map keys.
 */
@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly isMobile = toSignal(
    this.breakpointObserver
      .observe(Breakpoints.Handset)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  readonly isSmall = toSignal(
    this.breakpointObserver
      .observe(Breakpoints.Small)
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  readonly isNarrow = computed(() => {
    const mobile = this.isMobile();
    const small = this.isSmall();
    return mobile || small;
  });
}
