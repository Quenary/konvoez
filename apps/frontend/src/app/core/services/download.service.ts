import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { TuiDialogService } from '@taiga-ui/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import {
  FileShareDialogComponent,
  IFileShareDialogData,
} from '@shared/components/file-share-dialog/file-share-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class DownloadService {
  private readonly document = inject(DOCUMENT);
  private readonly tuiDialogService = inject(TuiDialogService);

  /**
   * In an iOS home-screen PWA a download navigates the only webview to a
   * screen with no way back, so files go through the share sheet instead.
   */
  public readonly usesShareDialog = this.isIosStandalone();

  public downloadUrl(url: string, fileName?: string): void {
    if (this.usesShareDialog) {
      this.openShareDialog({ url, fileName: fileName ?? 'file' });
      return;
    }

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

  private openShareDialog(data: IFileShareDialogData): void {
    this.tuiDialogService
      .open(new PolymorpheusComponent(FileShareDialogComponent), {
        closable: true,
        dismissible: true,
        size: 's',
        label: data.fileName,
        data,
      })
      .subscribe();
  }

  private isIosStandalone(): boolean {
    const navigator = this.document.defaultView?.navigator as
      (Navigator & { standalone?: boolean }) | undefined;
    return (
      navigator?.standalone === true &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    );
  }
}
