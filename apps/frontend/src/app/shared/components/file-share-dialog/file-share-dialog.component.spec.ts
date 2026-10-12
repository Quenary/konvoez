import { HttpEventType, HttpResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttachmentsApiService } from '@core/chat/outgoing/attachments-api.service';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileShareDialogComponent } from './file-share-dialog.component';

function documentWithView(view: unknown): Document {
  return new Proxy(document, {
    get(target, key) {
      if (key === 'defaultView') {
        return view;
      }
      const value = Reflect.get(target, key) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

describe('FileShareDialogComponent', () => {
  let fixture: ComponentFixture<FileShareDialogComponent>;
  let request: Subject<unknown>;
  let download: ReturnType<typeof vi.fn>;
  let canShare: ReturnType<typeof vi.fn>;
  let share: ReturnType<typeof vi.fn>;
  const completeWith = vi.fn();

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => root().textContent ?? '';

  function respond(): void {
    request.next(
      new HttpResponse({ body: new Blob(['x'], { type: 'image/png' }) }),
    );
    fixture.detectChanges();
  }

  beforeEach(async () => {
    completeWith.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    request = new Subject();
    download = vi.fn(() => request);
    canShare = vi.fn().mockReturnValue(true);
    share = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [FileShareDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: AttachmentsApiService, useValue: { download } },
        {
          provide: DOCUMENT,
          useValue: documentWithView({ navigator: { canShare, share } }),
        },
        {
          provide: POLYMORPHEUS_CONTEXT,
          useValue: {
            completeWith,
            data: {
              url: '/api/v1/attachments/id/content?download=1',
              fileName: 'photo.png',
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FileShareDialogComponent);
    fixture.detectChanges();
  });

  it('requests the file without the download flag to keep its type', () => {
    const url = new URL(download.mock.calls[0][0]);

    expect(url.pathname).toBe('/api/v1/attachments/id/content');
    expect(url.searchParams.has('download')).toBe(false);
  });

  it('shows a progress bar until the file is loaded', () => {
    request.next({ type: HttpEventType.DownloadProgress, loaded: 1, total: 4 });
    fixture.detectChanges();

    const progress = root().querySelector('progress');
    expect(progress?.value).toBe(25);
    expect(root().querySelector('button')).toBeNull();
  });

  it('keeps an indeterminate bar when the size is unknown', () => {
    request.next({ type: HttpEventType.DownloadProgress, loaded: 1 });
    fixture.detectChanges();

    expect(root().querySelector('progress')?.hasAttribute('value')).toBe(false);
  });

  it('shares the loaded file on tap and closes', async () => {
    respond();

    root().querySelector('button')?.click();

    expect(share).toHaveBeenCalledOnce();
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.name).toBe('photo.png');
    expect(file.type).toBe('image/png');
    await vi.waitFor(() => expect(completeWith).toHaveBeenCalled());
  });

  it('stays open when the share sheet is dismissed', async () => {
    share.mockRejectedValue(new DOMException('cancel', 'AbortError'));
    respond();

    root().querySelector('button')?.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(completeWith).not.toHaveBeenCalled();
    expect(root().querySelector('button')).toBeTruthy();
  });

  it('shows an error when sharing fails', async () => {
    share.mockRejectedValue(new DOMException('nope', 'NotAllowedError'));
    respond();

    root().querySelector('button')?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text()).toContain('ROOMS.DOWNLOAD_FAILED');
    });
    expect(completeWith).not.toHaveBeenCalled();
  });

  it('shows an error when the request fails', () => {
    request.error(new Error('network'));
    fixture.detectChanges();

    expect(text()).toContain('ROOMS.DOWNLOAD_FAILED');
  });

  it('shows an error when the file cannot be shared', () => {
    canShare.mockReturnValue(false);
    respond();

    expect(text()).toContain('ROOMS.DOWNLOAD_FAILED');
    expect(root().querySelector('button')).toBeNull();
  });
});
