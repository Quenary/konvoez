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

  it('re-encodes a client poster as a single-frame webp', async () => {
    const source = path.join(dir, 'anim.webp');
    const dest = path.join(dir, 'poster.webp');
    const frame = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 4,
        background: { r: 0, g: 128, b: 255, alpha: 1 },
      },
    })
      .webp()
      .toBuffer();
    await sharp(frame, { animated: true, pages: 2 }).webp().toFile(source);

    const info = await service.reencodeClientPoster(source, dest);
    const metadata = await sharp(dest).metadata();

    expect(info).toEqual({ width: 120, height: 80 });
    expect(metadata.format).toBe('webp');
    expect(metadata.pages ?? 1).toBe(1);
    expect(metadata.width).toBeLessThanOrEqual(1024);
  });

  it('rejects an oversized client poster', async () => {
    const source = path.join(dir, 'huge.jpg');
    const dest = path.join(dir, 'huge.webp');
    await sharp({
      create: {
        width: 5000,
        height: 5000,
        channels: 3,
        background: '#ccc',
      },
    })
      .jpeg()
      .toFile(source);

    await expect(
      service.reencodeClientPoster(source, dest),
    ).resolves.toBeNull();
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('strips exif from a re-encoded client poster', async () => {
    const source = path.join(dir, 'exif.jpg');
    const dest = path.join(dir, 'exif.webp');
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: '#f00',
      },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: 'konvoez' } } })
      .toFile(source);

    const info = await service.reencodeClientPoster(source, dest);
    const metadata = await sharp(dest).metadata();

    expect(info).toEqual({ width: 64, height: 64 });
    expect(metadata.exif).toBeUndefined();
  });

  it('returns null for a garbage client poster', async () => {
    const source = path.join(dir, 'garbage.bin');
    const dest = path.join(dir, 'garbage.webp');
    fs.writeFileSync(source, 'not-an-image');

    await expect(
      service.reencodeClientPoster(source, dest),
    ).resolves.toBeNull();
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('removes the cleaned file when stripping fails', async () => {
    const source = path.join(dir, 'broken.jpg');
    fs.writeFileSync(source, Buffer.from('not-a-jpeg'));

    await expect(service.stripMetadata(source)).rejects.toThrow();
    expect(fs.existsSync(`${source}.clean`)).toBe(false);
  });
});
