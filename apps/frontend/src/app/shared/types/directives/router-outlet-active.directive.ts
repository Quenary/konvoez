import { Directive, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Directive({
  selector: 'router-outlet[appRouterOutletActive]',
  exportAs: 'appRouterOutletActive',
  standalone: true,
})
export class RouterOutletActiveDirective {
  private readonly routerOutlet = inject(RouterOutlet);
  public readonly active = signal<boolean>(false);

  constructor() {
    this.routerOutlet.activateEvents
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.active.set(true);
      });
    this.routerOutlet.deactivateEvents
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.active.set(false);
      });
  }
}
