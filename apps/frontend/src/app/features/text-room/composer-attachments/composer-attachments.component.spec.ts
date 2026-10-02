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
