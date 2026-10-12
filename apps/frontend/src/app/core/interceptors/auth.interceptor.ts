import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { TokenRefreshService } from '@core/auth/token-refresh.service';

const ignoreList = ['/login', '/refresh', '/register'];

const ignore = (req: HttpRequest<unknown>): boolean => {
  return ignoreList.some((item) => req.url.includes(item));
};

const isRefreshable = (req: HttpRequest<unknown>, error: unknown): boolean => {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 401 &&
    req &&
    !ignore(req)
  );
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenRefreshService = inject(TokenRefreshService);

  return next(req).pipe(
    catchError((error) => {
      if (!isRefreshable(req, error)) {
        return throwError(() => error);
      }

      return from(tokenRefreshService.refresh()).pipe(
        switchMap((ok) => {
          if (!ok) {
            return throwError(() => error);
          }
          return next(req.clone());
        }),
      );
    }),
  );
};
