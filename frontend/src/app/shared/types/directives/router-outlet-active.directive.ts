import { Directive, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Directive({
  selector: 'router-outlet[routerOutletActive]',
  exportAs: 'routerOutletActive',
  standalone: true,
})
export class RouterOutletActiveDirective {
  public readonly active = signal<boolean>(false);

  constructor(private readonly routerOutlet: RouterOutlet) {
    this.routerOutlet.activateEvents.pipe(takeUntilDestroyed()).subscribe(() => {
      this.active.set(true);
    });
    this.routerOutlet.deactivateEvents.pipe(takeUntilDestroyed()).subscribe(() => {
      this.active.set(false);
    });
  }
}
