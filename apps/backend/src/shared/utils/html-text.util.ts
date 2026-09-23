import sanitizeHtml from 'sanitize-html';

/**
 * Strips markup and collapses whitespace so the result is safe plain text.
 */
export function htmlToPlainText(html: string, maxLength?: number): string {
  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, ' ')
    .trim();

  if (maxLength === undefined || maxLength < 1) {
    return text;
  }

  const chars = Array.from(text);
  if (chars.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return chars.slice(0, maxLength).join('');
  }

  return `${chars.slice(0, maxLength - 3).join('')}...`;
}
