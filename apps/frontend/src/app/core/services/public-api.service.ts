import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IPublicSettings, IPublicVersion } from '@konvoez/shared';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PublicApiService {
  private readonly http = inject(HttpClient);

  getSettings(): Observable<IPublicSettings> {
    return this.http.get<IPublicSettings>(
      `${environment.apiPath}/public/settings`,
    );
  }

  getVersion(): Observable<IPublicVersion> {
    return this.http.get<IPublicVersion>(
      `${environment.apiPath}/public/version`,
    );
  }
}
