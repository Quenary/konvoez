import path from 'path';
import { attachmentFileNameMaxLength, EAttachmentKind } from '@konvoez/shared';

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

export function sanitizeAttachmentName(originalName: string): string {
  const base = path
    .basename(originalName)
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\\/\u202a-\u202e\u2066-\u2069"]/g, '')
    .trim();
  const name = base.length > 0 ? base : 'file';
  if (name.length <= attachmentFileNameMaxLength) {
    return name;
  }
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  const kept = stem.slice(
    0,
    Math.max(attachmentFileNameMaxLength - ext.length, 1),
  );
  return `${kept}${ext}`.slice(0, attachmentFileNameMaxLength);
}

function asciiFallback(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  return ascii.length > 0 ? ascii : 'file';
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*!]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDisposition(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const clean = sanitizeAttachmentName(fileName);
  return `${disposition}; filename="${asciiFallback(clean)}"; filename*=UTF-8''${encodeRfc5987(clean)}`;
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
    return { kind: 'full' };
  }
  return { kind: 'partial', start, end };
}
