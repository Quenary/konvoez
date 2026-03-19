import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AvatarsApiService {
  private readonly httpClient = inject(HttpClient);

  uploadAvatar(avatar: File): Observable<string> {
    const formData = new FormData();
    formData.append('avatar', avatar);
    return this.httpClient.post('/api/avatars/upload', formData, {
      responseType: 'text',
      withCredentials: true,
    });
  }

  getUrl(key: string): Observable<string> {
    return this.httpClient.get(`/api/avatars/url`, {
      params: {
        key,
      },
      responseType: 'text',
      withCredentials: true,
    });
  }

  getUrlByUserId(userId: number): Observable<string> {
    return this.httpClient.get(`/api/avatars/url/${userId}`, {
      responseType: 'text',
      withCredentials: true,
    });
  }
}
