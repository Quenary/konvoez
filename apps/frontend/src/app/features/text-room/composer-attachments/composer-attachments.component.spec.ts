import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EAttachmentKind } from '@konvoez/shared';
import { MediaPreviewService } from '@shared/components/media-preview/media-preview.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ILocalFile } from '../outgoing/outgoing.types';
import { ComposerAttachmentsComponent } from './composer-attachments.component';

describe('ComposerAttachmentsComponent', () => {
  let fixture: ComponentFixture<ComposerAttachmentsComponent>;
  const open = vi.fn(() => of(undefined));

  const image: ILocalFile = {
    localId: 'img',
    file: new File(['a'], 'a.png', { type: 'image/png' }),
    kind: EAttachmentKind.IMAGE,
    previewUrl: 'blob:a',
  };
  const documentFile: ILocalFile = {
    localId: 'doc',
    file: new File(['b'], 'b.txt', { type: 'text/plain' }),
    kind: EAttachmentKind.FILE,
    previewUrl: null,
  };

  beforeEach(async () => {
    Element.prototype.scrollTo = vi.fn();
    open.mockClear();
    await TestBed.configureTestingModule({
      imports: [ComposerAttachmentsComponent],
      providers: [
        provideTranslateService(),
        { provide: MediaPreviewService, useValue: { open } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ComposerAttachmentsComponent);
    fixture.componentRef.setInput('files', [image, documentFile]);
    fixture.detectChanges();
  });

  it('renders thumbnails and removes a file', () => {
    expect(
      fixture.nativeElement.querySelectorAll('app-file-thumbnail'),
    ).toHaveLength(2);
    const removed: string[] = [];
    fixture.componentInstance.remove.subscribe((id) => removed.push(id));
    const buttons = fixture.nativeElement.querySelectorAll('.remove');
    (buttons[1] as HTMLButtonElement).click();
    expect(removed).toEqual(['doc']);
  });

  it('blurs only the edge that still has content to scroll', () => {
    const strip = fixture.nativeElement.querySelector('.strip') as HTMLElement;
    setScroll(strip, { scrollLeft: 0, clientWidth: 100, scrollWidth: 300 });
    strip.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.edge-end._on')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.edge-start._on')).toBeNull();

    setScroll(strip, { scrollLeft: 200, clientWidth: 100, scrollWidth: 300 });
    strip.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.edge-start._on')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.edge-end._on')).toBeNull();

    setScroll(strip, { scrollLeft: 80, clientWidth: 100, scrollWidth: 300 });
    strip.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.edge-start._on')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.edge-end._on')).toBeTruthy();

    setScroll(strip, { scrollLeft: 0, clientWidth: 300, scrollWidth: 300 });
    strip.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.edge._on')).toBeNull();
  });

  it('opens the preview at the media index and skips non-media', () => {
    const thumbnails =
      fixture.nativeElement.querySelectorAll('app-file-thumbnail');
    expect(thumbnails[1].querySelector('.activate')).toBeNull();
    (thumbnails[0].querySelector('.activate') as HTMLButtonElement).click();
    expect(open).toHaveBeenCalledWith(
      [expect.objectContaining({ src: 'blob:a', name: 'a.png' })],
      0,
    );
  });
});

function setScroll(
  element: HTMLElement,
  metrics: { scrollLeft: number; clientWidth: number; scrollWidth: number },
): void {
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    value: metrics.scrollLeft,
  });
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: metrics.clientWidth,
  });
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    value: metrics.scrollWidth,
  });
}
