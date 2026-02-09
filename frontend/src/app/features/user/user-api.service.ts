import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ICreateUser, IGetUser, IUpdateUser } from './user.interface';
import { environment } from '../../../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class UserApiService {
  private readonly httpClient = inject(HttpClient);

  list(): Observable<IGetUser[]> {
    return this.httpClient.get<IGetUser[]>(`${environment.apiPath}/user`, {
      withCredentials: true,
    });
  }

  create(body: ICreateUser): Observable<IGetUser> {
    return this.httpClient.post<IGetUser>(`${environment.apiPath}/user`, body);
  }

  read(id: number): Observable<IGetUser> {
    return this.httpClient.get<IGetUser>(`${environment.apiPath}/user/${id}`, {
      withCredentials: true,
    });
  }

  update(id: number, body: IUpdateUser): Observable<IGetUser> {
    return this.httpClient.put<IGetUser>(`${environment.apiPath}/user/${id}`, body, {
      withCredentials: true,
    });
  }

  delete(id: number): Observable<void> {
    return this.httpClient.delete<void>(`${environment.apiPath}/user/${id}`, {
      withCredentials: true,
    });
  }
}
