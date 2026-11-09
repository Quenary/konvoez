import { effect, inject, Signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

/**
 * Current value of a query param. A non-empty value is removed from the URL
 * so a refresh does not apply it again. The signal follows later values.
 */
export function takeInitialQueryParam(name: string): Signal<string | null> {
  const activatedRoute = inject(ActivatedRoute);
  const router = inject(Router);

  const value = toSignal(
    activatedRoute.queryParamMap.pipe(
      map((params) => {
        const raw = params.get(name);
        return raw && raw.trim().length > 0 ? raw.trim() : null;
      }),
    ),
    { initialValue: null },
  );

  effect(() => {
    const current = value();
    if (current) {
      untracked(() => {
        void router.navigate([], {
          relativeTo: activatedRoute,
          queryParams: { [name]: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    }
  });

  return value;
}
