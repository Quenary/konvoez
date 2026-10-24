import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IUserFull, IUserManagementUpdate } from '@konvoez/shared';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserManagementApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiPath}/user-management`;

  list(): Observable<IUserFull[]> {
    return this.http.get<IUserFull[]>(this.baseUrl, {
      withCredentials: true,
    });
  }

  get(id: number): Observable<IUserFull> {
    return this.http.get<IUserFull>(`${this.baseUrl}/${id}`, {
      withCredentials: true,
    });
  }

  update(id: number, dto: IUserManagementUpdate): Observable<IUserFull> {
    return this.http.patch<IUserFull>(`${this.baseUrl}/${id}`, dto, {
      withCredentials: true,
    });
  }

  anonymize(id: number): Observable<IUserFull> {
    return this.http.post<IUserFull>(
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
