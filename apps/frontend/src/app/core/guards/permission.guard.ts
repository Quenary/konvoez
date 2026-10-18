import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectAuth } from '@core/auth/auth.selectors';
import { EPermission } from '@konvoez/shared';
import { first, map } from 'rxjs';

export const permissionGuard = (permission: EPermission): CanActivateFn => {
  return () => {
    const store = inject(Store);
    const router = inject(Router);

    return store.select(selectAuth).pipe(
      first((auth) => auth.init),
      map((auth) => {
        const user = auth.user;
        const hasAccess = Boolean(
          user?.isOwner || user?.permissions?.includes(permission),
        );
        return hasAccess ? true : router.createUrlTree(['/']);
      }),
    );
  };
};
