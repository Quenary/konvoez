import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@environments/environment';
import { IUserSafe } from '@konvoez/shared';

@Injectable({
  providedIn: 'root',
})
export class UsersApiService {
  private readonly httpClient = inject(HttpClient);

  list(): Observable<IUserSafe[]> {
    return this.httpClient.get<IUserSafe[]>(`${environment.apiPath}/users`, {
      withCredentials: true,
    });
  }
}
