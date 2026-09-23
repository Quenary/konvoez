import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import {
  TPushSubscription,
  TPushSubscriptionEndpoint,
  TVapidPublicKey,
} from '@konvoez/shared';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly basePath = `${environment.apiPath}/notifications`;

  getPublicKey(): Observable<TVapidPublicKey> {
    return this.httpClient.get<TVapidPublicKey>(
      `${this.basePath}/vapid-public-key`,
      {
        withCredentials: true,
      },
    );
  }

  createSubscription(payload: TPushSubscription): Observable<void> {
    return this.httpClient.post<void>(`${this.basePath}/subscription`, payload, {
      withCredentials: true,
    });
  }

  unsubscribe(payload: TPushSubscriptionEndpoint): Observable<void> {
    return this.httpClient.post<void>(
      `${this.basePath}/subscription/unsubscribe`,
      payload,
      {
        withCredentials: true,
      },
    );
  }
}
