import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment.development';
import { IGetUser } from '../user/user.interface';
import { Observable } from 'rxjs';
import { ILoginBody } from './auth.interface';

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly httpClient = inject(HttpClient);

  login(body: ILoginBody): Observable<IGetUser> {
    return this.httpClient.post<IGetUser>(`${environment.apiPath}/auth/login`, body);
  }

  logout() {
    return this.httpClient.post<any>(`${environment.apiPath}/auth/logout`, {});
  }

  refresh() {
    return this.httpClient.post<any>(
      `${environment.apiPath}/auth/refresh`,
      {},
      { withCredentials: true },
    );
  }

  /**
   * Get current user
   * @returns
   */
  me(): Observable<IGetUser> {
    return this.httpClient.get<IGetUser>(`${environment.apiPath}/auth/me`, {
      withCredentials: true,
    });
  }
}
