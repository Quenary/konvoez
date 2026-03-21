import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TextRoomCommon } from '@common/text-room';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class TextRoomApiService {
  private readonly httpClient = inject(HttpClient);

  list(
    body: TextRoomCommon.IListRequest,
  ): Observable<TextRoomCommon.IListResponse> {
    return this.httpClient
      .post<TextRoomCommon.IListResponse>(
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

  create(
    body: TextRoomCommon.ICreateMessage,
  ): Observable<TextRoomCommon.IMessage> {
    return this.httpClient.post<TextRoomCommon.IMessage>(
      `${environment.apiPath}/text-rooms`,
      body,
    );
  }

  edit(
    messageId: string,
    body: TextRoomCommon.IEditMessage,
  ): Observable<TextRoomCommon.IMessage> {
    return this.httpClient.put<TextRoomCommon.IMessage>(
      `${environment.apiPath}/text-rooms/${messageId}`,
      body,
    );
  }

  delete(messageId: string): Observable<any> {
    return this.httpClient.delete(
      `${environment.apiPath}/text-rooms/${messageId}`,
    );
  }
}
