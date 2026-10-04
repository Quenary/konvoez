import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IUploadFileResult, IUser, IProfileUpdate } from '@konvoez/shared';
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

  patch(body: IProfileUpdate): Observable<IUser> {
    return this.httpClient.patch<IUser>(this.baseUrl, body, {
      withCredentials: true,
    });
  }

  anonymize(): Observable<IUser> {
    return this.httpClient.post<IUser>(
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
}
