import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { ImageProcessingService } from './image-processing.service';

describe('ImageProcessingService', () => {
  const service = new ImageProcessingService();
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-img-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a truncated jpeg and leaves no thumbnail file', async () => {
    const jpeg = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    const source = path.join(dir, 'trunc.jpg');
    const dest = path.join(dir, 'trunc.webp');
    fs.writeFileSync(source, jpeg.subarray(0, Math.floor(jpeg.length / 2)));

    await expect(service.writeThumbnail(source, dest, 1)).rejects.toThrow();
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('removes the cleaned file when stripping fails', async () => {
    const source = path.join(dir, 'broken.jpg');
    fs.writeFileSync(source, Buffer.from('not-a-jpeg'));

    await expect(service.stripMetadata(source)).rejects.toThrow();
    expect(fs.existsSync(`${source}.clean`)).toBe(false);
  });
});
