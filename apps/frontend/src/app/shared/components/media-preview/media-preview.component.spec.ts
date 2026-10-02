import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EAttachmentKind } from '@konvoez/shared';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_PREVIEW_DATA } from './media-preview';
import { MediaPreviewComponent } from './media-preview.component';

describe('MediaPreviewComponent', () => {
  let fixture: ComponentFixture<MediaPreviewComponent>;
  const complete = vi.fn();

  beforeEach(async () => {
    complete.mockClear();
    await TestBed.configureTestingModule({
      imports: [MediaPreviewComponent],
      providers: [
        provideTranslateService(),
        {
          provide: MEDIA_PREVIEW_DATA,
          useValue: {
            startIndex: 0,
            items: [
              {
                kind: EAttachmentKind.IMAGE,
                src: 'blob:one',
                name: 'one.png',
                downloadUrl: null,
              },
              {
                kind: EAttachmentKind.VIDEO,
                src: 'blob:two',
                name: 'two.mp4',
                downloadUrl: '/file?download=1',
              },
            ],
          },
        },
        {
          provide: POLYMORPHEUS_CONTEXT,
          useValue: { $implicit: { complete, next: vi.fn(), error: vi.fn() } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MediaPreviewComponent);
    fixture.detectChanges();
  });

  it('paginates through Taiga and does not handle arrow keys itself', () => {
    expect(
      fixture.nativeElement.querySelector('tui-preview-pagination'),
    ).toBeTruthy();
    fixture.componentInstance['onIndex'](1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('two.mp4');

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance['index']()).toBe(1);
  });

  it('completes the observer when closed', () => {
    fixture.componentInstance['close']();
    expect(complete).toHaveBeenCalled();
  });

  it('shows an unsupported video state with a download link', () => {
    fixture.componentInstance['onIndex'](1);
    fixture.componentInstance['onBroken']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'ROOMS.PREVIEW_UNSUPPORTED',
    );
    const link = fixture.nativeElement.querySelector(
      'a[href="/file?download=1"]',
    ) as HTMLAnchorElement | null;
    expect(link?.textContent).toContain('ROOMS.DOWNLOAD');
  });
});
