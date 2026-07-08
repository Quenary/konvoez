import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { Store } from '@ngrx/store';
import { selectAuth } from '@features/auth/auth.selectors';
import { first, map, tap } from 'rxjs';

export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const store = inject(Store);
  const router = inject(Router);
  return store.select(selectAuth).pipe(
    first((auth) => auth.init),
    map((auth) => !!auth.user),
    tap((res) => {
      if (!res) {
        router.navigate(['/auth']);
      }
    }),
  );
};
