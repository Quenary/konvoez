import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';
import {
  IAuthLogin,
  IAuthLoginResponse,
  IAuthLoginTwoFactor,
  IPasswordRecoveryConfirm,
  IPasswordRecoveryRequest,
  IUserFull,
  IAuthRegister,
} from '@konvoez/shared';

@Injectable({
  providedIn: 'root',
})
export class AuthApiService {
  private readonly httpClient = inject(HttpClient);

  login(body: IAuthLogin): Observable<IAuthLoginResponse> {
    return this.httpClient.post<IAuthLoginResponse>(
      `${environment.apiPath}/auth/login`,
      body,
    );
  }

  loginTwoFactor(body: IAuthLoginTwoFactor): Observable<IUserFull> {
    return this.httpClient.post<IUserFull>(
      `${environment.apiPath}/auth/login/2fa`,
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

  register(body: IAuthRegister): Observable<IUserFull> {
    return this.httpClient.post<IUserFull>(
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
  me(): Observable<IUserFull> {
    return this.httpClient.get<IUserFull>(`${environment.apiPath}/auth/me`, {
      withCredentials: true,
    });
  }
}
