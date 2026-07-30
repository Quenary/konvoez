import { HttpClient, HttpEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@environments/environment';
import { IUser, IUserCreate, IUserUpdate } from '@konvoez/shared';

@Injectable({
  providedIn: 'root',
})
export class UserApiService {
  private readonly httpClient = inject(HttpClient);

  list(): Observable<IUser[]> {
    return this.httpClient.get<IUser[]>(`${environment.apiPath}/users`, {
      withCredentials: true,
    });
  }

  create(body: IUserCreate): Observable<IUser> {
    return this.httpClient.post<IUser>(`${environment.apiPath}/users`, body);
  }

  read(id: number): Observable<IUser> {
    return this.httpClient.get<IUser>(`${environment.apiPath}/users/${id}`, {
      withCredentials: true,
    });
  }

  patch(id: number, body: IUserUpdate): Observable<IUser> {
    return this.httpClient.patch<IUser>(
      `${environment.apiPath}/users/${id}`,
      body,
      {
        withCredentials: true,
      },
    );
  }

  delete(id: number): Observable<void> {
    return this.httpClient.delete<void>(`${environment.apiPath}/users/${id}`, {
      withCredentials: true,
    });
  }

  avatarUpload(avatar: File): Observable<string> {
    const formData = new FormData();
    formData.append('avatar', avatar);
    return this.httpClient.post('/api/users/avatar/upload', formData, {
      responseType: 'text',
      withCredentials: true,
    });
  }

  avatarStream(url: string): Observable<HttpEvent<Blob>> {
    return this.httpClient.get(url, {
      responseType: 'blob',
      observe: 'events',
      withCredentials: true,
    });
  }
}
