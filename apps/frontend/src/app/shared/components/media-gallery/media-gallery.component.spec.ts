import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import {
  EAttachmentKind,
  IMediaCounts,
  IMediaGalleryItem,
} from '@konvoez/shared';
import { AttachmentsApiService } from '@core/chat/outgoing/attachments-api.service';
import { MediaPreviewService } from '@shared/components/media-preview/media-preview.service';
import { DownloadService } from '@core/services/download.service';
import { MediaGalleryComponent } from './media-gallery.component';

describe('MediaGalleryComponent', () => {
  let component: MediaGalleryComponent;
  let fixture: ComponentFixture<MediaGalleryComponent>;

  const mockAttachmentsApiService = {
    getCounts: vi.fn(),
    listMedia: vi.fn(),
  };

  const mockMediaPreviewService = {
    open: vi.fn().mockReturnValue(of(undefined)),
  };

  const mockDownloadService = {
    downloadUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockAttachmentsApiService.getCounts.mockReturnValue(
      of({
        image: 2,
        video: 0,
        audio: 1,
        file: 3,
      }),
    );

    mockAttachmentsApiService.listMedia.mockReturnValue(
      of({
        items: [
          {
            id: 'att-1',
            messageId: 'msg-1',
            kind: EAttachmentKind.IMAGE,
            name: 'pic.jpg',
            mime: 'image/jpeg',
            size: 1024,
            width: 800,
            height: 600,
            durationMs: null,
            url: '/att/1/content',
            thumbnailUrl: '/att/1/thumb',
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [MediaGalleryComponent],
      providers: [
        provideTranslateService(),
        {
          provide: AttachmentsApiService,
          useValue: mockAttachmentsApiService,
        },
        {
          provide: MediaPreviewService,
          useValue: mockMediaPreviewService,
        },
        {
          provide: DownloadService,
          useValue: mockDownloadService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaGalleryComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('roomId', 10);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads counts on init and hides empty types', () => {
    expect(mockAttachmentsApiService.getCounts).toHaveBeenCalledWith({
      roomId: 10,
      recipientId: undefined,
    });
    // video is 0, so only image, file, audio are present
    expect(component['categories']()).toHaveLength(3);
    const kinds = component['categories']().map((c) => c.kind);
    expect(kinds).toContain(EAttachmentKind.IMAGE);
    expect(kinds).toContain(EAttachmentKind.FILE);
    expect(kinds).toContain(EAttachmentKind.AUDIO);
    expect(kinds).not.toContain(EAttachmentKind.VIDEO);
  });

  it('navigates to category grid on selectType and loads items', async () => {
    component['selectType'](EAttachmentKind.IMAGE);
    expect(component['selectedType']()).toBe(EAttachmentKind.IMAGE);
    expect(mockAttachmentsApiService.listMedia).toHaveBeenCalledWith({
      roomId: 10,
      recipientId: undefined,
      type: EAttachmentKind.IMAGE,
      cursor: undefined,
      limit: 30,
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['items']()).toHaveLength(1);
  });

  it('opens preview with onGoToMessage callback when image tile is clicked', () => {
    const goToSpy = vi.fn();
    component.goToMessage.subscribe(goToSpy);

    const item = {
      id: 'att-1',
      messageId: 'msg-target-1',
      kind: EAttachmentKind.IMAGE,
      name: 'pic.jpg',
      mime: 'image/jpeg',
      size: 1024,
      width: 800,
      height: 600,
      durationMs: null,
      url: '/att/1/content',
      thumbnailUrl: '/att/1/thumb',
      createdAt: new Date().toISOString(),
    };
    component['items'].set([item]);

    component['openPreview'](item);
    expect(mockMediaPreviewService.open).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pic.jpg',
          messageId: 'msg-target-1',
        }),
      ]),
      0,
      expect.any(Function),
    );

    // Call the callback to verify it emits goToMessage
    const callback = mockMediaPreviewService.open.mock.calls[0][2];
    callback('msg-target-1');
    expect(goToSpy).toHaveBeenCalledWith('msg-target-1');
  });

  it('emits goToMessage when onGoToMessageClick is called', () => {
    const goToSpy = vi.fn();
    component.goToMessage.subscribe(goToSpy);

    component['onGoToMessageClick']('msg-audio-1');
    expect(goToSpy).toHaveBeenCalledWith('msg-audio-1');
  });

  it('downloads file via downloadService', () => {
    const item = {
      id: 'att-file',
      messageId: 'msg-1',
      kind: EAttachmentKind.FILE,
      name: 'doc.pdf',
      mime: 'application/pdf',
      size: 2048,
      width: null,
      height: null,
      durationMs: null,
      url: '/att/file/content',
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
    };
    component['downloadItem'](item);
    expect(mockDownloadService.downloadUrl).toHaveBeenCalledWith(
      '/att/file/content?download=1',
      'doc.pdf',
    );
  });

  it('returns back to categories list on clearSelectedType', () => {
    component['selectType'](EAttachmentKind.FILE);
    expect(component['selectedType']()).toBe(EAttachmentKind.FILE);

    component['clearSelectedType']();
    expect(component['selectedType']()).toBeNull();
    expect(component['items']()).toHaveLength(0);
  });

  it('ignores a stale category page when a newer request wins', () => {
    const first = new Subject<ReturnType<typeof mediaPage>>();
    const second = new Subject<ReturnType<typeof mediaPage>>();
    mockAttachmentsApiService.listMedia
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    component['selectType'](EAttachmentKind.IMAGE);
    component['selectType'](EAttachmentKind.VIDEO);

    second.next(mediaPage('video-1', EAttachmentKind.VIDEO));
    first.next(mediaPage('image-1', EAttachmentKind.IMAGE));

    expect(component['selectedType']()).toBe(EAttachmentKind.VIDEO);
    expect(component['items']().map((item) => item.id)).toEqual(['video-1']);
  });

  it('ignores a category page after leaving that category', () => {
    const pending = new Subject<ReturnType<typeof mediaPage>>();
    mockAttachmentsApiService.listMedia.mockReturnValueOnce(pending);

    component['selectType'](EAttachmentKind.IMAGE);
    component['clearSelectedType']();
    pending.next(mediaPage('image-1', EAttachmentKind.IMAGE));

    expect(component['selectedType']()).toBeNull();
    expect(component['items']()).toEqual([]);
  });

  it('ignores a stale counts response from the previous chat', () => {
    const first = new Subject<IMediaCounts>();
    const second = new Subject<IMediaCounts>();
    mockAttachmentsApiService.getCounts
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    fixture.componentRef.setInput('roomId', 11);
    fixture.detectChanges();
    fixture.componentRef.setInput('roomId', 12);
    fixture.detectChanges();

    second.next(mediaCounts(1));
    first.next(mediaCounts(9));

    expect(component['counts']()?.image).toBe(1);
  });
});

function mediaCounts(image: number): IMediaCounts {
  return { image, video: 0, audio: 0, file: 0 };
}

function mediaPage(
  id: string,
  kind: EAttachmentKind,
): { items: IMediaGalleryItem[]; nextCursor: null; hasMore: false } {
  return {
    items: [
      {
        id,
        messageId: 'msg-1',
        kind,
        name: `${id}.bin`,
        mime: 'application/octet-stream',
        size: 10,
        width: null,
        height: null,
        durationMs: null,
        url: `/att/${id}/content`,
        thumbnailUrl: null,
        createdAt: '2026-11-09T00:00:00.000Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
  };
}
