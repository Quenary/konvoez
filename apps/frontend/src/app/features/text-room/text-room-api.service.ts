import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  ITextRoomCreateMessage,
  ITextRoomEditMessage,
  ITextRoomListRequest,
  ITextRoomListResponse,
  ITextRoomMessage,
  IUser,
} from '@konvoez/shared';
import { map, Observable } from 'rxjs';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root',
})
export class TextRoomApiService {
  private readonly httpClient = inject(HttpClient);

  direct(): Observable<IUser[]> {
    return this.httpClient.get<IUser[]>(
      `${environment.apiPath}/text-rooms/direct`,
      {
        withCredentials: true,
      },
    );
  }

  list(body: ITextRoomListRequest): Observable<ITextRoomListResponse> {
    return this.httpClient
      .post<ITextRoomListResponse>(
        `${environment.apiPath}/text-rooms/list`,
        body,
      )
      .pipe(
        map((res) => ({
          ...res,
          items: res.items.map((item) => ({
            ...item,
            createdAt: new Date(item.createdAt),
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
          })),
        })),
      );
  }

  create(body: ITextRoomCreateMessage): Observable<ITextRoomMessage> {
    return this.httpClient.post<ITextRoomMessage>(
      `${environment.apiPath}/text-rooms`,
      body,
    );
  }

  update(
    messageId: string,
    body: ITextRoomEditMessage,
  ): Observable<ITextRoomMessage> {
    return this.httpClient.put<ITextRoomMessage>(
      `${environment.apiPath}/text-rooms/${messageId}`,
      body,
    );
  }

  delete(messageId: string): Observable<unknown> {
    return this.httpClient.delete(
      `${environment.apiPath}/text-rooms/${messageId}`,
    );
  }
}
