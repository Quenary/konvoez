import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';
import {
  ITwoFactorConfirm,
  ITwoFactorEnable,
  ITwoFactorRecoveryCodesResponse,
  ITwoFactorSetup,
  ITwoFactorSetupResponse,
} from '@konvoez/shared';

@Injectable({
  providedIn: 'root',
})
export class TwoFactorApiService {
  private readonly httpClient = inject(HttpClient);

  setup(body: ITwoFactorSetup): Observable<ITwoFactorSetupResponse> {
    return this.httpClient.post<ITwoFactorSetupResponse>(
      `${environment.apiPath}/profile/2fa/setup`,
      body,
      { withCredentials: true },
    );
  }

  enable(body: ITwoFactorEnable): Observable<ITwoFactorRecoveryCodesResponse> {
    return this.httpClient.post<ITwoFactorRecoveryCodesResponse>(
      `${environment.apiPath}/profile/2fa/enable`,
      body,
      { withCredentials: true },
    );
  }

  disable(body: ITwoFactorConfirm): Observable<void> {
    return this.httpClient.post<void>(
      `${environment.apiPath}/profile/2fa/disable`,
      body,
      { withCredentials: true },
    );
  }

  regenerateRecoveryCodes(
    body: ITwoFactorConfirm,
  ): Observable<ITwoFactorRecoveryCodesResponse> {
    return this.httpClient.post<ITwoFactorRecoveryCodesResponse>(
      `${environment.apiPath}/profile/2fa/recovery-codes`,
      body,
      { withCredentials: true },
    );
  }
}
