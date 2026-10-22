import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileShareDialogComponent } from '@shared/components/file-share-dialog/file-share-dialog.component';
import { DownloadService } from './download.service';

describe('DownloadService', () => {
  let link: HTMLAnchorElement;
  let appendChild: ReturnType<typeof vi.fn>;
  let setTimeoutSpy: ReturnType<typeof vi.fn>;
  let dialogOpen: ReturnType<typeof vi.fn>;

  function create(navigator: object): DownloadService {
    TestBed.configureTestingModule({
      providers: [
        DownloadService,
        {
          provide: DOCUMENT,
          useValue: {
            createElement: vi.fn().mockReturnValue(link),
            body: { appendChild },
            defaultView: { setTimeout: setTimeoutSpy, navigator },
          },
        },
        {
          provide: TuiResponsiveDialogService,
          useValue: { open: dialogOpen },
        },
      ],
    });
    return TestBed.inject(DownloadService);
  }

  const shareable = { standalone: true, share: vi.fn(), canShare: vi.fn() };

  beforeEach(() => {
    link = document.createElement('a');
    link.click = vi.fn();
    link.remove = vi.fn();

    appendChild = vi.fn();
    setTimeoutSpy = vi.fn((handler: () => void) => {
      handler();
    });
    dialogOpen = vi.fn(() => of(undefined));
  });

  describe('in a browser', () => {
    it('appends a hidden link, clicks it, and removes it', () => {
      const service = create({});

      service.downloadUrl('/files/photo.png?download=1', 'photo.png');

      expect(service.usesShareDialog).toBe(false);
      expect(link.href).toContain('/files/photo.png?download=1');
      expect(link.download).toBe('photo.png');
      expect(link.rel).toBe('noopener');
      expect(link.style.display).toBe('none');
      expect(appendChild).toHaveBeenCalledWith(link);
      expect(link.click).toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenCalled();
      expect(link.remove).toHaveBeenCalled();
      expect(dialogOpen).not.toHaveBeenCalled();
    });

    it('does not revoke blob URLs after download starts', () => {
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { revokeObjectURL });

      create({}).downloadUrl('blob:https://example.com/abc', 'export.zip');

      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('uses a link on iOS Safari tabs, where the app is not standalone', () => {
      const service = create({ ...shareable, standalone: false });

      expect(service.usesShareDialog).toBe(false);
    });

    it('uses a link when the browser cannot share files', () => {
      const service = create({ standalone: true });

      expect(service.usesShareDialog).toBe(false);
    });
  });

  describe('in an iOS standalone PWA', () => {
    it('opens the share dialog instead of navigating', () => {
      const service = create(shareable);

      service.downloadUrl('/api/v1/attachments/id/content?download=1', 'a.zip');

      expect(service.usesShareDialog).toBe(true);
      expect(dialogOpen).toHaveBeenCalledOnce();
      const [content, options] = dialogOpen.mock.calls[0];
      expect(content.component).toBe(FileShareDialogComponent);
      expect(options).toMatchObject({
        label: 'a.zip',
        data: {
          url: '/api/v1/attachments/id/content?download=1',
          fileName: 'a.zip',
        },
      });
      expect(link.click).not.toHaveBeenCalled();
    });

    it('falls back to a generic file name', () => {
      create(shareable).downloadUrl('/file');

      expect(dialogOpen.mock.calls[0][1].data.fileName).toBe('file');
    });
  });
});
