import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EAttachmentKind } from '@konvoez/shared';
import { ComposerDraftsService, toChatKey } from './composer-drafts';
import { ILocalFile } from '@core/chat/outgoing/outgoing.types';

describe('composer drafts', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('formats chat keys', () => {
    expect(toChatKey(4, null)).toBe('room:4');
    expect(toChatKey(null, 9)).toBe('dm:9');
    expect(toChatKey(null, null)).toBeNull();
  });

  it('revokes stashed urls and returns no draft', () => {
    const service = TestBed.inject(ComposerDraftsService);
    const files: ILocalFile[] = [
      {
        localId: '1',
        file: new File(['a'], 'a.png', { type: 'image/png' }),
        kind: EAttachmentKind.IMAGE,
        previewUrl: 'blob:a',
        posterStatus: 'ready',
        posterFile: null,
        posterUrl: null,
        videoWidth: null,
        videoHeight: null,
        videoDuration: null,
      },
    ];
    service.stash('room:1', files);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a');
    expect(service.take('room:1')).toEqual([]);
  });
});
