import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';
import {
  IAuthLogin,
  IAuthSetupStatus,
  IUser,
  IUserCreate,
} from '@konvoez/shared';

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly httpClient = inject(HttpClient);

  login(body: IAuthLogin): Observable<IUser> {
    return this.httpClient.post<IUser>(
      `${environment.apiPath}/auth/login`,
      body,
    );
  }

  logout() {
    return this.httpClient.post(
      `${environment.apiPath}/auth/logout`,
      {},
      { withCredentials: true },
    );
  }

  refresh() {
    return this.httpClient.post(
      `${environment.apiPath}/auth/refresh`,
      {},
      { withCredentials: true },
    );
  }

  getSetupStatus(): Observable<IAuthSetupStatus> {
    return this.httpClient.get<IAuthSetupStatus>(
      `${environment.apiPath}/auth/setup-status`,
    );
  }

  register(body: IUserCreate): Observable<IUser> {
    return this.httpClient.post<IUser>(
      `${environment.apiPath}/auth/register`,
      body,
    );
  }

  /**
   * Get current user
   * @returns
   */
  me(): Observable<IUser> {
    return this.httpClient.get<IUser>(`${environment.apiPath}/auth/me`, {
      withCredentials: true,
    });
  }
}
