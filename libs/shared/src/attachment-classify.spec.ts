import { describe, expect, it } from 'vitest';
import { classifyAttachmentKind } from './attachment-classify';
import { EAttachmentKind } from './enums';

describe('classifyAttachmentKind', () => {
  it('classifies inline images', () => {
    expect(classifyAttachmentKind('image/jpeg')).toBe(EAttachmentKind.IMAGE);
    expect(classifyAttachmentKind('image/png')).toBe(EAttachmentKind.IMAGE);
    expect(classifyAttachmentKind('image/gif')).toBe(EAttachmentKind.IMAGE);
    expect(classifyAttachmentKind('image/webp')).toBe(EAttachmentKind.IMAGE);
    expect(classifyAttachmentKind('image/avif')).toBe(EAttachmentKind.IMAGE);
  });

  it('classifies inline videos', () => {
    expect(classifyAttachmentKind('video/mp4')).toBe(EAttachmentKind.VIDEO);
    expect(classifyAttachmentKind('video/webm')).toBe(EAttachmentKind.VIDEO);
    expect(classifyAttachmentKind('video/quicktime')).toBe(
      EAttachmentKind.VIDEO,
    );
  });

  it('classifies audio formats', () => {
    expect(classifyAttachmentKind('audio/mpeg')).toBe(EAttachmentKind.AUDIO);
    expect(classifyAttachmentKind('audio/ogg')).toBe(EAttachmentKind.AUDIO);
    expect(classifyAttachmentKind('audio/wav')).toBe(EAttachmentKind.AUDIO);
    expect(classifyAttachmentKind('audio/webm')).toBe(EAttachmentKind.AUDIO);
    expect(classifyAttachmentKind('audio/x-m4a')).toBe(EAttachmentKind.AUDIO);
    expect(classifyAttachmentKind('audio/flac')).toBe(EAttachmentKind.AUDIO);
  });

  it('falls back to FILE for unknown or unsupported formats', () => {
    expect(classifyAttachmentKind('application/pdf')).toBe(
      EAttachmentKind.FILE,
    );
    expect(classifyAttachmentKind('image/svg+xml')).toBe(EAttachmentKind.FILE);
    expect(classifyAttachmentKind('text/plain')).toBe(EAttachmentKind.FILE);
    expect(classifyAttachmentKind('')).toBe(EAttachmentKind.FILE);
    expect(classifyAttachmentKind(null)).toBe(EAttachmentKind.FILE);
    expect(classifyAttachmentKind(undefined)).toBe(EAttachmentKind.FILE);
  });
});
