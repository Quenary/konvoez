import { HttpEvent, HttpEventType } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AttachmentsApiService } from '@core/chat/outgoing/attachments-api.service';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiDialogContext } from '@taiga-ui/core';
import { TuiProgressBar } from '@taiga-ui/kit';
import { injectContext } from '@taiga-ui/polymorpheus';

export interface IFileShareDialogData {
  readonly url: string;
  readonly fileName: string;
}

type TFileShareState = 'loading' | 'ready' | 'failed';

/**
 * Saves a file from an iOS standalone PWA. Navigating to a download there
 * opens a Quick Look screen with no way out, so the file is loaded here and
 * handed to the share sheet. The share sheet needs a fresh tap, so loading
 * and sharing are two steps.
 */
@Component({
  selector: 'app-file-share-dialog',
  imports: [TranslatePipe, TuiButton, TuiProgressBar],
  templateUrl: './file-share-dialog.component.html',
  styleUrl: './file-share-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileShareDialogComponent {
  private readonly document = inject(DOCUMENT);
  private readonly attachmentsApiService = inject(AttachmentsApiService);
  private readonly context =
    injectContext<TuiDialogContext<void, IFileShareDialogData>>();

  protected readonly state = signal<TFileShareState>('loading');
  protected readonly progress = signal<number | null>(null);

  private file: File | null = null;

  constructor() {
    const { url, fileName } = this.context.data;
    this.attachmentsApiService
      .download(this.withoutDownloadFlag(url))
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (event) => this.onEvent(event, fileName),
        error: (error) => this.fail(error),
      });
  }

  protected async save(): Promise<void> {
    const navigator = this.document.defaultView?.navigator;
    if (!this.file || !navigator) {
      return;
    }
    try {
      await navigator.share({ files: [this.file] });
      this.context.completeWith();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.fail(error);
      }
    }
  }

  private onEvent(event: HttpEvent<Blob>, fileName: string): void {
    if (event.type === HttpEventType.DownloadProgress) {
      this.progress.set(
        event.total ? Math.round((event.loaded / event.total) * 100) : null,
      );
      return;
    }
    if (event.type !== HttpEventType.Response || !event.body) {
      return;
    }
    const file = new File([event.body], fileName, { type: event.body.type });
    if (!this.document.defaultView?.navigator.canShare({ files: [file] })) {
      this.fail(new Error('The file cannot be shared'));
      return;
    }
    this.file = file;
    this.state.set('ready');
  }

  // `download=1` makes the server answer with a generic octet-stream. Without
  // it, images and videos keep their real type, so the share sheet can offer
  // "Save Image".
  private withoutDownloadFlag(url: string): string {
    const target = new URL(url, this.document.baseURI);
    target.searchParams.delete('download');
    return target.href;
  }

  private fail(error: unknown): void {
    console.error(error);
    this.state.set('failed');
  }
}
