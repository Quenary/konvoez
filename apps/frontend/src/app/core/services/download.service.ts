import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class DownloadService {
  private readonly document = inject(DOCUMENT);

  public downloadUrl(url: string, fileName?: string): void {
    const doc = this.document;
    const view = doc.defaultView;
    if (!view) {
      return;
    }

    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName ?? '';
    link.rel = 'noopener';
    link.style.display = 'none';

    doc.body.appendChild(link);
    link.click();

    view.setTimeout(() => {
      link.remove();
    }, 0);
  }
}
