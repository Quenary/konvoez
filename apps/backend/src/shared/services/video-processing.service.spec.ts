import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
  assertPosterStorage,
  posterSeekSeconds,
  videoDisplaySize,
  VideoProcessingService,
} from './video-processing.service';

describe('video poster helpers', () => {
  it('swaps display size for 90 and 270 degree rotation', () => {
    expect(
      videoDisplaySize(
        JSON.stringify({
          streams: [
            {
              width: 1920,
              height: 1080,
              side_data_list: [{ rotation: -90 }],
            },
          ],
        }),
      ),
    ).toEqual({ width: 1080, height: 1920, durationSeconds: null });

    expect(
      videoDisplaySize(
        JSON.stringify({
          streams: [{ width: 640, height: 480, tags: { rotate: '180' } }],
          format: { duration: '3.5' },
        }),
      ),
    ).toEqual({ width: 640, height: 480, durationSeconds: 3.5 });
  });

  it('rejects a probe payload without a video stream', () => {
    expect(videoDisplaySize('not-json')).toBeNull();
    expect(videoDisplaySize(JSON.stringify({ streams: [] }))).toBeNull();
  });

  it('seeks to the first frame only for a short clip', () => {
    expect(posterSeekSeconds(0.4)).toEqual([0]);
    expect(posterSeekSeconds(5)).toEqual([1, 0]);
    expect(posterSeekSeconds(null)).toEqual([1, 0]);
  });

  it('maps a full disk message to ENOSPC', () => {
    expect(() => assertPosterStorage('ok')).not.toThrow();
    expect(() => assertPosterStorage('No space left on device')).toThrow(
      expect.objectContaining({ code: 'ENOSPC' }),
    );
  });
});

describe('VideoProcessingService', () => {
  const service = new VideoProcessingService();
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-video-'));
  });

  it('writes a webp poster and the display size', async () => {
    const source = path.join(dir, 'clip.mp4');
    const dest = path.join(dir, 'clip.webp');
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=1280x720:rate=10:duration=2',
      '-pix_fmt',
      'yuv420p',
      '-t',
      '2',
      source,
    ]);

    const poster = await service.createPoster(source, dest);

    expect(poster).toEqual({ width: 1280, height: 720, written: true });
    const metadata = await sharp(dest).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(1024);
    expect(metadata.height).toBeLessThanOrEqual(1024);
    expect(fs.existsSync(`${dest}.frame.jpg`)).toBe(false);
  }, 20_000);

  it('still writes a poster for a clip shorter than one second', async () => {
    const source = path.join(dir, 'short.mp4');
    const dest = path.join(dir, 'short.webp');
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=160x90:d=0.4',
      '-pix_fmt',
      'yuv420p',
      '-t',
      '0.4',
      source,
    ]);

    const poster = await service.createPoster(source, dest);

    expect(poster.written).toBe(true);
    expect(poster.width).toBe(160);
    expect(poster.height).toBe(90);
  }, 20_000);

  it('keeps going when the file is not a video', async () => {
    const source = path.join(dir, 'note.txt');
    const dest = path.join(dir, 'note.webp');
    fs.writeFileSync(source, 'hello');

    const poster = await service.createPoster(source, dest);

    expect(poster).toEqual({ width: null, height: null, written: false });
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.existsSync(`${dest}.frame.jpg`)).toBe(false);
  });
});

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited ${code}`));
    });
  });
}
