import { TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { EAttachmentKind } from '@konvoez/shared';
import { TuiPreviewDialogService } from '@taiga-ui/kit';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_PREVIEW_DATA } from './media-preview';
import { MediaPreviewService } from './media-preview.service';

describe('MediaPreviewService', () => {
  const open = vi.fn(() => of(undefined));

  beforeEach(() => {
    open.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: TuiPreviewDialogService, useValue: { open } }],
    });
  });

  it('opens the preview dialog with the items and start index', () => {
    const items = [
      {
        kind: EAttachmentKind.IMAGE as const,
        src: 'blob:a',
        name: 'a.png',
        downloadUrl: null,
      },
    ];
    TestBed.inject(MediaPreviewService).open(items, 0);
    const calls = open.mock.calls as unknown as unknown[][];
    const created = calls[0]?.[0] as { i: Injector };
    expect(created.i.get(MEDIA_PREVIEW_DATA)).toEqual({
      items,
      startIndex: 0,
    });
  });
});
