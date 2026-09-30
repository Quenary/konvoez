import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IUser, IUserManagementUpdate } from '@konvoez/shared';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserManagementApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiPath}/user-management`;

  list(): Observable<IUser[]> {
    return this.http.get<IUser[]>(this.baseUrl, {
      withCredentials: true,
    });
  }

  get(id: number): Observable<IUser> {
    return this.http.get<IUser>(`${this.baseUrl}/${id}`, {
      withCredentials: true,
    });
  }

  update(id: number, dto: IUserManagementUpdate): Observable<IUser> {
    return this.http.patch<IUser>(`${this.baseUrl}/${id}`, dto, {
      withCredentials: true,
    });
  }

  anonymize(id: number): Observable<IUser> {
    return this.http.post<IUser>(
      `${this.baseUrl}/${id}/anonymize`,
      {},
      {
        withCredentials: true,
      },
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, {
      withCredentials: true,
    });
  }
}
