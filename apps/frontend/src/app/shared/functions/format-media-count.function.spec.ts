import { describe, expect, it, vi } from 'vitest';
import { EAttachmentKind } from '@konvoez/shared';
import { TranslateService } from '@ngx-translate/core';
import { formatMediaCount } from './format-media-count.function';

describe('formatMediaCount', () => {
  it('formats Russian plurals correctly', () => {
    const translateService = {
      currentLang: 'ru',
      instant: vi.fn((key: string, params: { count: number }) => {
        if (key === 'ROOMS.MEDIA.IMAGES.FEW')
          return `${params.count} изображения`;
        if (key === 'ROOMS.MEDIA.VIDEOS.FEW') return `${params.count} видео`;
        if (key === 'ROOMS.MEDIA.FILES.MANY') return `${params.count} файлов`;
        if (key === 'ROOMS.MEDIA.AUDIO.FEW') return `${params.count} аудио`;
        return key;
      }),
    } as unknown as TranslateService;

    expect(formatMediaCount(EAttachmentKind.IMAGE, 22, translateService)).toBe(
      '22 изображения',
    );
    expect(formatMediaCount(EAttachmentKind.VIDEO, 3, translateService)).toBe(
      '3 видео',
    );
    expect(formatMediaCount(EAttachmentKind.FILE, 5, translateService)).toBe(
      '5 файлов',
    );
    expect(formatMediaCount(EAttachmentKind.AUDIO, 2, translateService)).toBe(
      '2 аудио',
    );
  });

  it('falls back to OTHER if specific plural form is missing', () => {
    const translateService = {
      currentLang: 'en',
      instant: vi.fn((key: string, params: { count: number }) => {
        if (key === 'ROOMS.MEDIA.IMAGES.OTHER') return `${params.count} images`;
        return key;
      }),
    } as unknown as TranslateService;

    expect(formatMediaCount(EAttachmentKind.IMAGE, 10, translateService)).toBe(
      '10 images',
    );
  });
});
