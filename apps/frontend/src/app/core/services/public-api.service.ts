import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IPublicSettings } from '@konvoez/shared';
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
}
