import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IPublicSettings, IPublicVersion } from '@konvoez/shared';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PublicApiService {
  private readonly httpClient = inject(HttpClient);

  getSettings(): Observable<IPublicSettings> {
    return this.httpClient.get<IPublicSettings>(
      `${environment.apiPath}/public/settings`,
    );
  }

  getVersion(): Observable<IPublicVersion> {
    return this.httpClient.get<IPublicVersion>(
      `${environment.apiPath}/public/version`,
    );
  }
}
