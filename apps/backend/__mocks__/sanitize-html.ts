export default function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  return dirty.replace(/<[^>]*>?/gm, '');
}
