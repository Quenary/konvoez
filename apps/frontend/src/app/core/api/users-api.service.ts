import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@environments/environment';
import { IUser } from '@konvoez/shared';

@Injectable({
  providedIn: 'root',
})
export class UsersApiService {
  private readonly httpClient = inject(HttpClient);

  list(): Observable<IUser[]> {
    return this.httpClient.get<IUser[]>(`${environment.apiPath}/users`, {
      withCredentials: true,
    });
  }
}
