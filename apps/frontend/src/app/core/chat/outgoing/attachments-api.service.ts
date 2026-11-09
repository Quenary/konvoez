import { HttpClient, HttpEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  EAttachmentKind,
  IAttachment,
  IMediaCounts,
  IMediaListResponse,
} from '@konvoez/shared';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';
import { toUploadBlob } from '@shared/functions/upload-blob.function';
import { uploadRequestHeaders } from '@shared/functions/upload-request-headers';

export interface IAttachmentUploadParts {
  readonly poster?: File | null;
  readonly videoWidth?: number | null;
  readonly videoHeight?: number | null;
  readonly videoDuration?: number | null;
}

@Injectable({ providedIn: 'root' })
export class AttachmentsApiService {
  private readonly httpClient = inject(HttpClient);

  upload(
    file: File,
    hints?: IAttachmentUploadParts,
  ): Observable<HttpEvent<IAttachment>> {
    const body = new FormData();
    if (hints?.videoWidth != null) {
      body.append('videoWidth', String(hints.videoWidth));
    }
    if (hints?.videoHeight != null) {
      body.append('videoHeight', String(hints.videoHeight));
    }
    if (hints?.videoDuration != null) {
      body.append('videoDuration', String(hints.videoDuration));
    }
    if (hints?.poster) {
      body.append('poster', toUploadBlob(hints.poster), hints.poster.name);
    }
    body.append('file', toUploadBlob(file), file.name);
    return this.httpClient.post<IAttachment>(
      `${environment.apiPath}/attachments`,
      body,
      {
        reportUploadProgress: true,
        observe: 'events',
        headers: uploadRequestHeaders,
      },
    );
  }

  delete(id: string): Observable<void> {
    return this.httpClient.delete<void>(
      `${environment.apiPath}/attachments/${id}`,
    );
  }

  download(url: string): Observable<HttpEvent<Blob>> {
    return this.httpClient.get(url, {
      responseType: 'blob',
      observe: 'events',
      reportProgress: true,
      withCredentials: true,
    });
  }

  getCounts(params: {
    roomId?: number;
    recipientId?: number;
  }): Observable<IMediaCounts> {
    const httpParams: Record<string, string | number> = {};
    if (params.roomId != null) {
      httpParams['roomId'] = params.roomId;
    }
    if (params.recipientId != null) {
      httpParams['recipientId'] = params.recipientId;
    }
    return this.httpClient.get<IMediaCounts>(
      `${environment.apiPath}/attachments/counts`,
      {
        params: httpParams,
        withCredentials: true,
      },
    );
  }

  listMedia(params: {
    roomId?: number;
    recipientId?: number;
    type: EAttachmentKind;
    cursor?: string;
    limit?: number;
  }): Observable<IMediaListResponse> {
    const httpParams: Record<string, string | number> = {
      type: params.type,
    };
    if (params.roomId != null) {
      httpParams['roomId'] = params.roomId;
    }
    if (params.recipientId != null) {
      httpParams['recipientId'] = params.recipientId;
    }
    if (params.cursor != null) {
      httpParams['cursor'] = params.cursor;
    }
    if (params.limit != null) {
      httpParams['limit'] = params.limit;
    }
    return this.httpClient.get<IMediaListResponse>(
      `${environment.apiPath}/attachments`,
      {
        params: httpParams,
        withCredentials: true,
      },
    );
  }
}
