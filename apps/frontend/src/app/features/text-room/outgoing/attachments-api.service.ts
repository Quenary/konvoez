import { HttpClient, HttpEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IAttachment } from '@konvoez/shared';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';

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
      body.append('poster', hints.poster, hints.poster.name);
    }
    body.append('file', file, file.name);
    return this.httpClient.post<IAttachment>(
      `${environment.apiPath}/attachments`,
      body,
      { reportUploadProgress: true, observe: 'events' },
    );
  }

  delete(id: string): Observable<void> {
    return this.httpClient.delete<void>(
      `${environment.apiPath}/attachments/${id}`,
    );
  }
}
