import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  IUploadFileResult,
  IUserFull,
  IProfileUpdate,
  IProfileEmailVerificationConfirm,
  IProfileEmailChangeConfirm,
} from '@konvoez/shared';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';
import { toUploadBlob } from '@shared/functions/upload-blob.function';
import { uploadRequestHeaders } from '@shared/functions/upload-request-headers';

@Injectable({
  providedIn: 'root',
})
export class ProfileApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly baseUrl = `${environment.apiPath}/profile`;

  patch(body: IProfileUpdate): Observable<IUserFull> {
    return this.httpClient.patch<IUserFull>(this.baseUrl, body, {
      withCredentials: true,
    });
  }

  anonymize(): Observable<IUserFull> {
    return this.httpClient.post<IUserFull>(
      `${this.baseUrl}/anonymize`,
      {},
      {
        withCredentials: true,
      },
    );
  }

  remove(): Observable<void> {
    return this.httpClient.delete<void>(this.baseUrl, {
      withCredentials: true,
    });
  }

  avatarUpload(avatar: File): Observable<IUploadFileResult> {
    const formData = new FormData();
    formData.append('avatar', toUploadBlob(avatar), avatar.name);
    return this.httpClient.post<IUploadFileResult>(
      `${this.baseUrl}/avatar/upload`,
      formData,
      {
        withCredentials: true,
        headers: uploadRequestHeaders,
      },
    );
  }

  requestEmailVerification(): Observable<{ ok: true }> {
    return this.httpClient.post<{ ok: true }>(
      `${this.baseUrl}/email-verification/request`,
      {},
      { withCredentials: true },
    );
  }

  confirmEmailVerification(
    body: IProfileEmailVerificationConfirm,
  ): Observable<IUserFull> {
    return this.httpClient.post<IUserFull>(
      `${this.baseUrl}/email-verification/confirm`,
      body,
      { withCredentials: true },
    );
  }

  confirmEmailChange(body: IProfileEmailChangeConfirm): Observable<IUserFull> {
    return this.httpClient.post<IUserFull>(
      `${this.baseUrl}/email-change/confirm`,
      body,
      { withCredentials: true },
    );
  }

  resendEmailChange(): Observable<{ ok: true }> {
    return this.httpClient.post<{ ok: true }>(
      `${this.baseUrl}/email-change/resend`,
      {},
      { withCredentials: true },
    );
  }

  cancelEmailChange(): Observable<IUserFull> {
    return this.httpClient.post<IUserFull>(
      `${this.baseUrl}/email-change/cancel`,
      {},
      { withCredentials: true },
    );
  }
}
