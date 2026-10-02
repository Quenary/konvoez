import { EAttachmentKind } from '@konvoez/shared';
import {
  contentDisposition,
  inlinePolicy,
  resolveByteRange,
} from './attachments.http';

describe('attachments.http', () => {
  it('builds an ASCII fallback and an RFC 5987 filename', () => {
    const value = contentDisposition('attachment', 'Отчёт.pdf');
    expect(value).toContain('filename="_____.pdf"');
    expect(value).toContain(
      `filename*=UTF-8''${encodeURIComponent('Отчёт.pdf')}`,
    );
  });

  it('strips quotes and newlines from the file name', () => {
    const value = contentDisposition('inline', 'a"b\r\nc');
    expect(value).not.toContain('\n');
    expect(value).not.toContain('\r');
    expect(value).toContain('filename="abc"');
  });

  it('serves media inline unless download=1', () => {
    expect(
      inlinePolicy({ kind: EAttachmentKind.IMAGE, download: undefined })
        .disposition,
    ).toBe('inline');
    expect(
      inlinePolicy({ kind: EAttachmentKind.VIDEO, download: '1' }).disposition,
    ).toBe('attachment');
    expect(
      inlinePolicy({ kind: EAttachmentKind.FILE, download: undefined })
        .disposition,
    ).toBe('attachment');
    expect(
      inlinePolicy({ kind: EAttachmentKind.AUDIO, download: undefined })
        .contentType,
    ).toBe('sniffed');
    expect(
      inlinePolicy({ kind: EAttachmentKind.FILE, download: undefined })
        .contentType,
    ).toBeNull();
  });

  it('resolves a single range, a suffix, an open range, and rejects the rest', () => {
    expect(resolveByteRange('bytes=0-99', 1000)).toEqual({
      kind: 'partial',
      start: 0,
      end: 99,
    });
    expect(resolveByteRange('bytes=-500', 1000)).toEqual({
      kind: 'partial',
      start: 500,
      end: 999,
    });
    expect(resolveByteRange('bytes=500-', 1000)).toEqual({
      kind: 'partial',
      start: 500,
      end: 999,
    });
    expect(resolveByteRange('bytes=1000-1001', 1000).kind).toBe(
      'unsatisfiable',
    );
    expect(resolveByteRange('bytes=0-1,2-3', 1000).kind).toBe('full');
    expect(resolveByteRange('not-a-range', 1000).kind).toBe('full');
  });
});
