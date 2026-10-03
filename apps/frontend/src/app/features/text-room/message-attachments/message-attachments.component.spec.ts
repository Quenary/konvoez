import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import {
  attachmentsAnimatedInlineMaxSize,
  EAttachmentKind,
  IAttachment,
} from '@konvoez/shared';
import { MediaPreviewService } from '@shared/components/media-preview/media-preview.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IOutgoingMessage } from '../outgoing/outgoing.types';
import { MessageAttachmentsComponent } from './message-attachments.component';

function attachment(
  overrides: Partial<IAttachment> & Pick<IAttachment, 'id' | 'kind'>,
): IAttachment {
  return {
    name: overrides.id,
    mime: 'application/octet-stream',
    size: 10,
    width: null,
    height: null,
    url: `/api/v1/attachments/${overrides.id}/content`,
    thumbnailUrl: null,
    ...overrides,
  };
}

describe('MessageAttachmentsComponent', () => {
  let fixture: ComponentFixture<MessageAttachmentsComponent>;
  const open = vi.fn(() => of(undefined));

  beforeEach(async () => {
    open.mockClear();
    await TestBed.configureTestingModule({
      imports: [MessageAttachmentsComponent],
      providers: [
        provideTranslateService(),
        { provide: MediaPreviewService, useValue: { open } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MessageAttachmentsComponent);
  });

  it('splits media, audio and files', () => {
    fixture.componentRef.setInput('attachments', [
      attachment({
        id: 'img',
        kind: EAttachmentKind.IMAGE,
        mime: 'image/png',
        thumbnailUrl: '/thumb',
      }),
      attachment({
        id: 'sound',
        kind: EAttachmentKind.AUDIO,
        mime: 'audio/mpeg',
      }),
      attachment({ id: 'doc', kind: EAttachmentKind.FILE, mime: 'text/plain' }),
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('app-file-thumbnail')).toHaveLength(1);
    expect(root.querySelector('audio')).toBeTruthy();
    expect(root.querySelectorAll('a[tuiFile], a')).toHaveLength(1);
  });

  it('uses the original url for a small gif and the thumbnail otherwise', () => {
    const gif = attachment({
      id: 'gif',
      kind: EAttachmentKind.IMAGE,
      mime: 'image/gif',
      size: attachmentsAnimatedInlineMaxSize,
      url: '/gif',
      thumbnailUrl: '/gif-thumb',
    });
    const photo = attachment({
      id: 'photo',
      kind: EAttachmentKind.IMAGE,
      mime: 'image/jpeg',
      url: '/photo',
      thumbnailUrl: '/photo-thumb',
    });
    fixture.componentRef.setInput('attachments', [gif, photo]);
    fixture.detectChanges();
    const images = [
      ...fixture.nativeElement.querySelectorAll('img'),
    ] as HTMLImageElement[];
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/gif',
      '/photo-thumb',
    ]);
  });

  it('shows an outgoing file error and emits remove', () => {
    const outgoing: IOutgoingMessage = {
      tempId: 'temp',
      data: {
        content: '',
        roomId: 1,
        recipientId: null,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      createdAt: new Date(),
      state: { phase: 'failed', reason: 'upload' },
      files: [
        {
          localId: 'doc',
          file: new File(['a'], 'a.txt', { type: 'text/plain' }),
          kind: EAttachmentKind.FILE,
          previewUrl: null,
          state: { status: 'failed', code: 'tooLarge' },
        },
      ],
    };
    fixture.componentRef.setInput('outgoing', outgoing);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'ROOMS.UPLOAD_ERROR.TOO_LARGE',
    );
    const removed: string[] = [];
    fixture.componentInstance.removeFile.subscribe((id) => removed.push(id));
    fixture.debugElement
      .query(By.css('tui-file'))
      .triggerEventHandler('remove', undefined);
    expect(removed).toEqual(['doc']);
  });

  it('uses a video poster when the server stored one', () => {
    fixture.componentRef.setInput('attachments', [
      attachment({
        id: 'clip',
        kind: EAttachmentKind.VIDEO,
        mime: 'video/mp4',
        url: '/clip',
        thumbnailUrl: '/clip-thumb',
        width: 160,
        height: 90,
      }),
    ]);
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector(
      'img',
    ) as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/clip-thumb');
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    expect(fixture.nativeElement.querySelector('.play')).toBeTruthy();
  });

  it('keeps a placeholder when a video has no poster', () => {
    fixture.componentRef.setInput('attachments', [
      attachment({
        id: 'clip',
        kind: EAttachmentKind.VIDEO,
        mime: 'video/mp4',
        url: '/clip',
      }),
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  it('opens the preview at the clicked media index', () => {
    fixture.componentRef.setInput('attachments', [
      attachment({
        id: 'one',
        kind: EAttachmentKind.IMAGE,
        mime: 'image/png',
        url: '/one',
      }),
      attachment({
        id: 'two',
        kind: EAttachmentKind.IMAGE,
        mime: 'image/png',
        url: '/two',
      }),
    ]);
    fixture.detectChanges();
    const activate = fixture.nativeElement.querySelectorAll('.activate');
    (activate[1] as HTMLButtonElement).click();
    expect(open).toHaveBeenCalledWith(
      [
        expect.objectContaining({ src: '/one' }),
        expect.objectContaining({ src: '/two' }),
      ],
      1,
    );
  });
});
