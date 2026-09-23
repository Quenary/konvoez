import { htmlToPlainText } from './html-text.util';

/**
 * Extracts unique trigrams from HTML content for blind indexing
 */
export function extractTrigrams(htmlContent: string): string[] {
  const cleanText = htmlToPlainText(htmlContent);
  const normalized = cleanText.toLowerCase().replace(/\s+/g, '');
  const chars = Array.from(normalized);

  const trigrams = new Set<string>();

  for (let i = 0; i <= chars.length - 3; i++) {
    trigrams.add(chars.slice(i, i + 3).join(''));
  }

  return Array.from(trigrams);
}
