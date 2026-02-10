import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IRoom, IRoomCreate, IRoomUpdate } from './rooms.interface';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class RoomsApiService {
  private readonly httpClient = inject(HttpClient);

  list(): Observable<IRoom[]> {
    return this.httpClient.get<IRoom[]>(`${environment.apiPath}/rooms`, {
      withCredentials: true,
    });
  }

  create(body: IRoomCreate): Observable<IRoom> {
    return this.httpClient.post<IRoom>(`${environment.apiPath}/rooms`, body, {
      withCredentials: true,
    });
  }

  read(id: number): Observable<IRoom> {
    return this.httpClient.get<IRoom>(`${environment.apiPath}/rooms/${id}`, {
      withCredentials: true,
    });
  }

  update(id: number, body: IRoomUpdate): Observable<IRoom> {
    return this.httpClient.put<IRoom>(`${environment.apiPath}/rooms/${id}`, body, {
      withCredentials: true,
    });
  }

  remove(id: number): Observable<any> {
    return this.httpClient.delete(`${environment.apiPath}/rooms/${id}`, {
      withCredentials: true,
    });
  }
}
