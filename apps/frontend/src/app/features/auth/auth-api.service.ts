import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';
import {
  IAuthLogin,
  IPasswordRecoveryConfirm,
  IPasswordRecoveryRequest,
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

  register(body: IUserCreate): Observable<IUser> {
    return this.httpClient.post<IUser>(
      `${environment.apiPath}/auth/register`,
      body,
    );
  }

  requestPasswordRecovery(
    body: IPasswordRecoveryRequest,
  ): Observable<{ ok: true }> {
    return this.httpClient.post<{ ok: true }>(
      `${environment.apiPath}/auth/password-recovery/request`,
      body,
    );
  }

  confirmPasswordRecovery(
    body: IPasswordRecoveryConfirm,
  ): Observable<{ ok: true }> {
    return this.httpClient.post<{ ok: true }>(
      `${environment.apiPath}/auth/password-recovery/confirm`,
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
