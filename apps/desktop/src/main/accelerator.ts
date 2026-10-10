export function formatKeyboardEventToAccelerator(e: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): string | null {
  const isMac = process.platform === 'darwin';
  const parts: string[] = [];

  const hasCtrl = e.ctrlKey || (!isMac && e.metaKey);
  const hasMeta = isMac && e.metaKey;

  if (hasCtrl) {
    parts.push('CommandOrControl');
  }
  if (hasMeta && !parts.includes('CommandOrControl')) {
    parts.push('Super');
  }
  if (e.altKey) {
    parts.push('Alt');
  }
  if (e.shiftKey) {
    parts.push('Shift');
  }

  // Key normalization
  const key = e.key;
  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
    return null;
  }

  // Convert keys
  let mainKey = key;
  if (key === ' ') {
    mainKey = 'Space';
  } else if (key.length === 1) {
    mainKey = key.toUpperCase();
  }

  parts.push(mainKey);
  return parts.join('+');
}
