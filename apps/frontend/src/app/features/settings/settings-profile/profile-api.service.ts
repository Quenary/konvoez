import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IUploadFileResult, IUser, IProfileUpdate } from '@konvoez/shared';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';

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

  avatarUpload(avatar: File): Observable<IUploadFileResult> {
    const formData = new FormData();
    formData.append('avatar', avatar);
    return this.httpClient.post<IUploadFileResult>(
      `${this.baseUrl}/avatar/upload`,
      formData,
      {
        withCredentials: true,
      },
    );
  }
}
