import { HttpClient, HttpEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IAttachment } from '@konvoez/shared';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AttachmentsApiService {
  private readonly httpClient = inject(HttpClient);

  upload(file: File): Observable<HttpEvent<IAttachment>> {
    const body = new FormData();
    body.append('file', file);
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
