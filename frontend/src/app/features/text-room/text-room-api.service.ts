import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Paged } from '@common/paged';
import { TextRoomCommon } from '@common/text-room';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class TextRoomApiService {
  private readonly httpClient = inject(HttpClient);

  list(
    body: TextRoomCommon.IListRequest,
  ): Observable<Paged.IResponse<TextRoomCommon.IMessage>> {
    return this.httpClient.post<Paged.IResponse<TextRoomCommon.IMessage>>(
      `${environment.apiPath}/text-rooms/list`,
      body,
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
