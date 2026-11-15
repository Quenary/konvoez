import { HttpInterceptorFn } from '@angular/common/http';
import { CLIENT_LANGUAGE_HEADER } from '@konvoez/shared';

export const clientLanguageInterceptor: HttpInterceptorFn = (req, next) => {
  const browserLocale =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language.trim()
      : null;

  if (browserLocale) {
    const modified = req.clone({
      setHeaders: {
        [CLIENT_LANGUAGE_HEADER]: browserLocale,
      },
    });
    return next(modified);
  }

  return next(req);
};
