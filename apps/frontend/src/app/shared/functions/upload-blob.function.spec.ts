import { describe, expect, it } from 'vitest';
import { toUploadBlob } from './upload-blob.function';

describe('toUploadBlob', () => {
  it('returns a new blob with the same bytes and type', async () => {
    const file = new File(['hello'], 'a.png', { type: 'image/png' });

    const blob = toUploadBlob(file);

    expect(blob).not.toBe(file);
    expect(blob.size).toBe(file.size);
    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('hello');
  });
});
