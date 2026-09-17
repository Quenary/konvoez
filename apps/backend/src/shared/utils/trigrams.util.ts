import sanitizeHtml from 'sanitize-html';

/**
 * Extracts unique trigrams from HTML content for blind indexing
 */
export function extractTrigrams(htmlContent: string): string[] {
  // 1. Strip HTML tags (keep text content only)
  const cleanText = sanitizeHtml(htmlContent, {
    allowedTags: [],
    allowedAttributes: {},
  });

  // 2. Convert to lowercase and strip all whitespace characters
  const normalized = cleanText.toLowerCase().replace(/\s+/g, '');
  const chars = Array.from(normalized);

  const trigrams = new Set<string>();

  // 3. Extract unique trigrams
  for (let i = 0; i <= chars.length - 3; i++) {
    trigrams.add(chars.slice(i, i + 3).join(''));
  }

  return Array.from(trigrams);
}
