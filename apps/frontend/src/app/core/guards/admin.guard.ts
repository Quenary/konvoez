import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectAuth } from '@features/auth/auth.selectors';
import { EUserRole } from '@konvoez/shared';
import { first, map } from 'rxjs';

export const adminGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  return store.select(selectAuth).pipe(
    first((auth) => auth.init),
    map((auth) => {
      const isAdminOrOwner =
        auth.user?.role === EUserRole.ADMIN ||
        auth.user?.role === EUserRole.OWNER;
      return isAdminOrOwner
        ? true
        : router.createUrlTree(['/settings/profile']);
    }),
  );
};
