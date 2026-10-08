import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { IInvite, IInviteCreate } from '@konvoez/shared';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root',
})
export class InvitesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiPath}/invites`;

  list(): Observable<IInvite[]> {
    return this.http.get<IInvite[]>(this.baseUrl, {
      withCredentials: true,
    });
  }

  create(dto: IInviteCreate): Observable<IInvite> {
    return this.http.post<IInvite>(this.baseUrl, dto, {
      withCredentials: true,
    });
  }

  revoke(id: number): Observable<IInvite> {
    return this.http.patch<IInvite>(
      `${this.baseUrl}/${id}/revoke`,
      {},
      {
        withCredentials: true,
      },
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, {
      withCredentials: true,
    });
  }
}
