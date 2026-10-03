jest.mock('load-esm', () => {
  const { execFileSync } =
    require('child_process') as typeof import('child_process');
  return {
    loadEsm: async () => ({
      fileTypeFromBuffer: async (buffer: Uint8Array) => {
        const script = [
          "import { fileTypeFromBuffer } from 'file-type';",
          'const result = await fileTypeFromBuffer(Buffer.from(process.env.FILE_BYTES, "base64"));',
          'process.stdout.write(JSON.stringify(result ?? null));',
        ].join('\n');
        const output = execFileSync(
          process.execPath,
          ['--input-type=module', '-e', script],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              FILE_BYTES: Buffer.from(buffer).toString('base64'),
            },
          },
        );
        return JSON.parse(output) as { mime: string } | null;
      },
    }),
  };
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { MimeSnifferService } from './mime-sniffer.service';

describe('MimeSnifferService', () => {
  const service = new MimeSnifferService();
  let dir: string;
  let png: Buffer;
  let jpeg: Buffer;

  beforeAll(async () => {
    png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    jpeg = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
  });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-mime-'));
  });

  async function sniff(name: string, bytes: Buffer): Promise<string | null> {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, bytes);
    return service.sniff(filePath);
  }

  it('detects png, jpeg and mp4 magic bytes', async () => {
    await expect(sniff('a.png', png)).resolves.toBe('image/png');
    await expect(sniff('a.jpg', jpeg)).resolves.toBe('image/jpeg');
    const mp4 = Buffer.alloc(24);
    mp4.writeUInt32BE(24, 0);
    mp4.write('ftyp', 4);
    mp4.write('isom', 8);
    mp4.write('mp41', 16);
    await expect(sniff('a.mp4', mp4)).resolves.toBe('video/mp4');
  }, 20_000);

  it('returns null for html, svg and plain text', async () => {
    await expect(
      sniff('a.html', Buffer.from('<html><body>hi</body></html>')),
    ).resolves.toBeNull();
    await expect(
      sniff('a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).resolves.toBeNull();
    await expect(sniff('a.txt', Buffer.from('hello'))).resolves.toBeNull();
  });
});
