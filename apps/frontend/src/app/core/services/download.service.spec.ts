import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadService } from './download.service';

describe('DownloadService', () => {
  let service: DownloadService;
  let link: HTMLAnchorElement;
  let appendChild: ReturnType<typeof vi.fn>;
  let setTimeoutSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    link = document.createElement('a');
    link.click = vi.fn();
    link.remove = vi.fn();

    appendChild = vi.fn();
    setTimeoutSpy = vi.fn((handler: () => void) => {
      handler();
    });

    TestBed.configureTestingModule({
      providers: [
        DownloadService,
        {
          provide: DOCUMENT,
          useValue: {
            createElement: vi.fn().mockReturnValue(link),
            body: { appendChild },
            defaultView: { setTimeout: setTimeoutSpy },
          },
        },
      ],
    });

    service = TestBed.inject(DownloadService);
  });

  it('appends a hidden link, clicks it, and removes it', () => {
    service.downloadUrl('/files/photo.png?download=1', 'photo.png');

    expect(link.href).toContain('/files/photo.png?download=1');
    expect(link.download).toBe('photo.png');
    expect(link.rel).toBe('noopener');
    expect(link.style.display).toBe('none');
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
  });

  it('does not revoke blob URLs after download starts', () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { revokeObjectURL });

    service.downloadUrl('blob:https://example.com/abc', 'export.zip');

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
