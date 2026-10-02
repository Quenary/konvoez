import { EAttachmentKind } from '@konvoez/shared';

export type TByteRangeResolution =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly start: number; readonly end: number }
  | { readonly kind: 'unsatisfiable' };

export function contentSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
  };
}

export function attachmentEtag(id: string, thumbnail: boolean): string {
  return thumbnail ? `"${id}-thumb"` : `"${id}"`;
}

export function etagMatches(
  ifNoneMatch: string | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  return ifNoneMatch
    .split(',')
    .map((part) => part.trim())
    .some((part) => part === etag || part === '*');
}

function sanitizeFileName(name: string): string {
  // TODO: Implement proper filename sanitization
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f"\\]/g, '').trim();
  return cleaned.length > 0 ? cleaned : 'file';
}

function asciiFallback(name: string): string {
  const ascii = sanitizeFileName(name).replace(/[^\x20-\x7e]/g, '_');
  return ascii.length > 0 ? ascii : 'file';
}

export function contentDisposition(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const clean = sanitizeFileName(fileName);
  const encoded = encodeURIComponent(clean);
  return `${disposition}; filename="${asciiFallback(clean)}"; filename*=UTF-8''${encoded}`;
}

export function inlinePolicy(input: {
  kind: EAttachmentKind;
  download: string | undefined;
}): { contentType: string | null; disposition: 'inline' | 'attachment' } {
  const inlineKinds = new Set<EAttachmentKind>([
    EAttachmentKind.IMAGE,
    EAttachmentKind.VIDEO,
    EAttachmentKind.AUDIO,
  ]);
  if (input.download === '1' || !inlineKinds.has(input.kind)) {
    return { contentType: null, disposition: 'attachment' };
  }
  return { contentType: 'sniffed', disposition: 'inline' };
}

export function resolveByteRange(
  header: string | undefined,
  size: number,
): TByteRangeResolution {
  if (!header) {
    return { kind: 'full' };
  }
  const match = /^bytes=(.+)$/i.exec(header.trim());
  if (!match?.[1] || match[1].includes(',')) {
    return { kind: 'full' };
  }
  const spec = match[1];
  if (!/^\d*-\d*$/.test(spec) || spec === '-') {
    return { kind: 'full' };
  }
  const [startRaw, endRaw] = spec.split('-');
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return { kind: 'full' };
    }
    if (size === 0) {
      return { kind: 'unsatisfiable' };
    }
    const length = Math.min(suffix, size);
    return { kind: 'partial', start: size - length, end: size - 1 };
  }
  const start = Number(startRaw);
  if (!Number.isInteger(start) || start < 0 || start >= size) {
    return { kind: 'unsatisfiable' };
  }
  const end =
    endRaw === '' || endRaw === undefined
      ? size - 1
      : Math.min(Number(endRaw), size - 1);
  if (!Number.isInteger(end) || end < start) {
    return { kind: 'unsatisfiable' };
  }
  return { kind: 'partial', start, end };
}
