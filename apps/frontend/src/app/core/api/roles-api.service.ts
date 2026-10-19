import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ICreateRole, IRole, IUpdateRole } from '@konvoez/shared';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root',
})
export class RolesApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly baseUrl = `${environment.apiPath}/roles`;

  list(): Observable<IRole[]> {
    return this.httpClient.get<IRole[]>(this.baseUrl, {
      withCredentials: true,
    });
  }

  findAll(): Observable<IRole[]> {
    return this.list();
  }

  create(dto: ICreateRole): Observable<IRole> {
    return this.httpClient.post<IRole>(this.baseUrl, dto, {
      withCredentials: true,
    });
  }

  get(id: number): Observable<IRole> {
    return this.httpClient.get<IRole>(`${this.baseUrl}/${id}`, {
      withCredentials: true,
    });
  }

  update(id: number, dto: IUpdateRole): Observable<IRole> {
    return this.httpClient.put<IRole>(`${this.baseUrl}/${id}`, dto, {
      withCredentials: true,
    });
  }

  remove(id: number): Observable<void> {
    return this.httpClient.delete<void>(`${this.baseUrl}/${id}`, {
      withCredentials: true,
    });
  }
}
