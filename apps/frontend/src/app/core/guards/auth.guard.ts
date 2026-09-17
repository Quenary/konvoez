import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectAuth } from '@features/auth/auth.selectors';
import { first, map } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  return store.select(selectAuth).pipe(
    first((auth) => auth.init),
    map((auth) => (auth.user ? true : router.createUrlTree(['/auth']))),
  );
};
