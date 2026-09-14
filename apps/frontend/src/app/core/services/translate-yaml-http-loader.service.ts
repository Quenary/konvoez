import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, catchError, map, of } from 'rxjs';
import { parse } from 'yaml';

@Injectable({
  providedIn: 'root',
})
export class TranslateYamlHttpLoader implements TranslateLoader {
  private readonly httpClient = inject(HttpClient);

  public getTranslation(lang: string): Observable<TranslationObject> {
    return this.httpClient
      .get(`i18n/${lang}.yaml`, { responseType: 'text' })
      .pipe(
        map((data) => parse(data)),
        catchError(() => of({})),
      );
  }
}
