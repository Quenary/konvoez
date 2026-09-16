import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TSetting } from '@konvoez/shared';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SettingsApiService {
  private readonly httpClient = inject(HttpClient);

  list(): Observable<TSetting[]> {
    return this.httpClient.get<TSetting[]>(
      `${environment.apiPath}/settings/list`,
      {
        withCredentials: true,
      },
    );
  }

  update(key: string, value: unknown): Observable<TSetting> {
    return this.httpClient.put<TSetting>(
      `${environment.apiPath}/settings/${key}`,
      { value },
      {
        withCredentials: true,
      },
    );
  }
}
