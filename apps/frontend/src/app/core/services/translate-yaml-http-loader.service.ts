import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, catchError, map, of } from 'rxjs';
import { parse } from 'yaml';
import { APP_VERSION, withVersion } from '@core/asset-version';
import { FALLBACK_LANGUAGE } from '@konvoez/shared';

@Injectable({
  providedIn: 'root',
})
export class TranslateYamlHttpLoader implements TranslateLoader {
  private readonly httpClient = inject(HttpClient);

  public getTranslation(lang: string): Observable<TranslationObject> {
    return this.httpClient
      .get(withVersion(`i18n/${lang}.yaml`, APP_VERSION), {
        responseType: 'text',
      })
      .pipe(
        map((data) => parse(data)),
        catchError((err) => {
          console.error(err);
          if (lang === FALLBACK_LANGUAGE) {
            return of({});
          }
          return this.httpClient
            .get(withVersion(`i18n/${FALLBACK_LANGUAGE}.yaml`, APP_VERSION), {
              responseType: 'text',
            })
            .pipe(
              map((data) => parse(data)),
              catchError(() => of({})),
            );
        }),
      );
  }
}
