import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SettingsCommon } from '@common/settings';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SettingsApiService {
  private readonly httpClient = inject(HttpClient);

  list(): Observable<SettingsCommon.ISetting<any>[]> {
    return this.httpClient.get<SettingsCommon.ISetting<any>[]>(
      `${environment.apiPath}/settings/list`,
      {
        withCredentials: true,
      },
    );
  }
}
