import { spawn as spawnProcess, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
  resolveFfmpegBinary,
  VideoProcessingService,
} from './video-processing.service';

const ffmpegBinary = resolveFfmpegBinary();
const hasFfmpeg =
  spawnSync(ffmpegBinary, ['-version'], { stdio: 'ignore' }).status === 0;

if (process.env['KONVOEZ_REQUIRE_FFMPEG'] === '1' && !hasFfmpeg) {
  throw new Error(
    'KONVOEZ_REQUIRE_FFMPEG=1 but ffmpeg is not executable. Set FFMPEG_PATH or install ffmpeg.',
  );
}

(hasFfmpeg ? describe : describe.skip)('VideoProcessingService ffmpeg', () => {
  const service = new VideoProcessingService();
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-video-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes a webp poster, display size, and duration', async () => {
    const source = path.join(dir, 'clip.mp4');
    const dest = path.join(dir, 'clip.webp');
    await run(ffmpegBinary, [
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

    const poster = await service.createPoster(source, dest, 'video/mp4');

    const metadata = await sharp(dest).metadata();
    expect(poster).toEqual({
      width: metadata.width,
      height: metadata.height,
      written: true,
      undecodable: false,
      durationMs: 2000,
      outcome: 'frame',
    });
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(1024);
    expect(metadata.height).toBeLessThanOrEqual(1024);
    expect(fs.existsSync(`${dest}.frame.jpg`)).toBe(false);
  }, 20_000);

  it('still writes a poster for a clip shorter than one second', async () => {
    const source = path.join(dir, 'short.mp4');
    const dest = path.join(dir, 'short.webp');
    await run(ffmpegBinary, [
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

    const poster = await service.createPoster(source, dest, 'video/mp4');

    expect(poster.written).toBe(true);
    expect(poster.undecodable).toBe(false);
    expect(poster.outcome).toBe('frame');
    expect(poster.width).toBe(160);
    expect(poster.height).toBe(90);
    expect(poster.durationMs).toBe(400);
  }, 20_000);

  it('ignores misleading container metadata tags', async () => {
    const source = path.join(dir, 'meta.mp4');
    const dest = path.join(dir, 'meta.webp');
    await run(ffmpegBinary, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x180:rate=10:duration=2',
      '-pix_fmt',
      'yuv420p',
      '-metadata',
      'comment=No space left on device',
      '-metadata',
      'title=Duration: 23:59:59.00, start',
      '-t',
      '2',
      source,
    ]);

    const poster = await service.createPoster(source, dest, 'video/mp4');

    expect(poster.outcome).toBe('frame');
    expect(poster.durationMs).toBe(2000);
    expect(poster.written).toBe(true);
  }, 20_000);

  it('treats an audio-only mp4 as undecodable', async () => {
    const source = path.join(dir, 'audio-only.mp4');
    const dest = path.join(dir, 'audio-only.webp');
    await run(ffmpegBinary, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:a',
      'aac',
      source,
    ]);

    const poster = await service.createPoster(source, dest, 'video/mp4');

    expect(poster).toEqual({
      width: null,
      height: null,
      written: false,
      undecodable: true,
      durationMs: null,
      outcome: 'undecodable',
    });
  }, 20_000);

  it('treats a file ffmpeg cannot decode as undecodable', async () => {
    const source = path.join(dir, 'note.txt');
    const dest = path.join(dir, 'note.webp');
    fs.writeFileSync(source, 'hello');

    const poster = await service.createPoster(source, dest, 'video/mp4');

    expect(poster).toEqual({
      width: null,
      height: null,
      written: false,
      undecodable: true,
      durationMs: null,
      outcome: 'undecodable',
    });
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.existsSync(`${dest}.frame.jpg`)).toBe(false);
  });
});

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: 'ignore' });
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
