jest.mock('child_process', () => {
  const actual =
    jest.requireActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: jest.fn((...args: Parameters<typeof actual.spawn>) =>
      actual.spawn(...args),
    ),
  };
});

import { type ChildProcess } from 'child_process';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Logger } from '@nestjs/common';
import {
  assertPosterStorage,
  parseFfmpegDurationMs,
  resolveFfmpegBinary,
  videoInputFormat,
  VideoProcessingService,
} from './video-processing.service';

describe('video poster helpers', () => {
  it('maps a full disk message to ENOSPC', () => {
    expect(() => assertPosterStorage('ok')).not.toThrow();
    expect(() => assertPosterStorage('No space left on device')).toThrow(
      expect.objectContaining({ code: 'ENOSPC' }),
    );
  });

  it('maps sniffed video types to an explicit ffmpeg format', () => {
    expect(videoInputFormat('video/mp4')).toBe('mp4');
    expect(videoInputFormat('video/webm')).toBe('webm');
    expect(videoInputFormat('video/quicktime')).toBe('mov');
    expect(videoInputFormat('video/hevc')).toBeNull();
  });

  it('uses FFMPEG_PATH and does not fall back when that path is set', () => {
    const previous = process.env['FFMPEG_PATH'];
    process.env['FFMPEG_PATH'] = '/opt/ffmpeg';
    expect(resolveFfmpegBinary()).toBe('/opt/ffmpeg');
    process.env['FFMPEG_PATH'] = '   ';
    expect(resolveFfmpegBinary()).toBe('ffmpeg');
    if (previous === undefined) {
      delete process.env['FFMPEG_PATH'];
    } else {
      process.env['FFMPEG_PATH'] = previous;
    }
  });

  it('parses ffmpeg Duration lines', () => {
    expect(parseFfmpegDurationMs('Duration: 00:01:23.45, start: 0')).toBe(
      83450,
    );
    expect(parseFfmpegDurationMs('Duration: N/A, bitrate: N/A')).toBeNull();
    expect(parseFfmpegDurationMs('Duration: 24:00:00.01')).toBeNull();
    expect(parseFfmpegDurationMs('Duration: 24:00:00.00')).toBe(86_400_000);
  });
});

describe('poster process limits', () => {
  let service: VideoProcessingService;
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    service = new VideoProcessingService();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konvoez-video-limit-'));
    for (const key of ['MASTER_KEY', 'JWT_SECRET', 'S3_ACCESS_KEY']) {
      savedEnv[key] = process.env[key];
      process.env[key] = `secret-${key}`;
    }
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    const actual =
      jest.requireActual<typeof import('child_process')>('child_process');
    jest.mocked(childProcess.spawn).mockClear();
    jest
      .mocked(childProcess.spawn)
      .mockImplementation((...args) => actual.spawn(...args));
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function fakeProcess(
    close: 'fail' | 'hang' | 'enoent' | 'eacces' | 'enoexec' | 'empty',
  ): ChildProcess {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: (signal?: NodeJS.Signals | number) => boolean;
    };
    child.stdout = stdout;
    child.stderr = stderr;
    const finish = (code: number | null): void => {
      setTimeout(() => {
        child.emit('close', code);
      }, 0);
    };
    child.kill = () => {
      finish(null);
      return true;
    };
    if (close === 'enoent' || close === 'eacces' || close === 'enoexec') {
      const code =
        close === 'enoent'
          ? 'ENOENT'
          : close === 'eacces'
            ? 'EACCES'
            : 'ENOEXEC';
      setTimeout(() => {
        child.emit(
          'error',
          Object.assign(new Error(`spawn ${code}`), { code }),
        );
      }, 0);
      return child as unknown as ChildProcess;
    }
    if (close === 'empty') {
      setTimeout(() => {
        finish(0);
      }, 0);
      return child as unknown as ChildProcess;
    }
    if (close === 'fail') {
      setTimeout(() => {
        finish(1);
      }, 0);
    }
    return child as unknown as ChildProcess;
  }

  async function untilSpawns(count: number): Promise<void> {
    const started = Date.now();
    while (jest.mocked(childProcess.spawn).mock.calls.length < count) {
      if (Date.now() - started > 1_000) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  it('pins the container format and omits server secrets', async () => {
    const spawnMock = jest
      .mocked(childProcess.spawn)
      .mockImplementation(() => fakeProcess('fail'));
    spawnMock.mockClear();

    const poster = await service.createPoster(
      path.join(dir, 'clip.webm'),
      path.join(dir, 'clip.webp'),
      'video/webm',
    );

    expect(poster).toEqual({
      width: null,
      height: null,
      written: false,
      undecodable: false,
      durationMs: null,
      outcome: 'failed',
    });
    expect(spawnMock).toHaveBeenCalledTimes(2);
    const seeks: string[] = [];
    for (const call of spawnMock.mock.calls) {
      expect(call[0]).toBe(resolveFfmpegBinary());
      const args = call[1] as readonly string[];
      expect(args).toEqual(
        expect.arrayContaining([
          '-loglevel',
          'info',
          '-protocol_whitelist',
          'file',
          '-f',
          'webm',
          '-threads',
          '1',
          '-filter_threads',
          '1',
          '-map',
          '0:V:0',
        ]),
      );
      expect(args).not.toContain('-vf');
      const options = call[2] as { env?: NodeJS.ProcessEnv } | undefined;
      expect(options?.env).not.toHaveProperty('MASTER_KEY');
      expect(options?.env).not.toHaveProperty('JWT_SECRET');
      expect(options?.env).not.toHaveProperty('S3_ACCESS_KEY');
      expect(options?.env?.PATH).toBe(process.env.PATH);
      seeks.push(args[args.indexOf('-ss') + 1] ?? '');
    }
    expect(seeks).toEqual(['1', '0']);
  });

  it('does not grab another frame after a timeout', async () => {
    const spawnMock = jest
      .mocked(childProcess.spawn)
      .mockImplementation(() => fakeProcess('hang'));
    spawnMock.mockClear();
    const pending = service.createPoster(
      path.join(dir, 'clip.mp4'),
      path.join(dir, 'clip.webp'),
      'video/mp4',
      40,
    );

    await untilSpawns(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    await expect(pending).resolves.toEqual({
      width: null,
      height: null,
      written: false,
      undecodable: false,
      durationMs: null,
      outcome: 'timeout',
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('treats an empty frame as undecodable', async () => {
    const spawnMock = jest
      .mocked(childProcess.spawn)
      .mockImplementation(() => fakeProcess('empty'));
    spawnMock.mockClear();

    await expect(
      service.createPoster(
        path.join(dir, 'clip.mp4'),
        path.join(dir, 'clip.webp'),
        'video/mp4',
      ),
    ).resolves.toEqual({
      width: null,
      height: null,
      written: false,
      undecodable: true,
      durationMs: null,
      outcome: 'undecodable',
    });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it.each(['eacces', 'enoexec'] as const)(
    'warns once when ffmpeg cannot be started (%s)',
    async (code) => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const spawnMock = jest
        .mocked(childProcess.spawn)
        .mockImplementation(() => fakeProcess(code));
      spawnMock.mockClear();
      warn.mockClear();

      await expect(
        service.createPoster(
          path.join(dir, 'clip.mp4'),
          path.join(dir, 'clip.webp'),
          'video/mp4',
        ),
      ).resolves.toMatchObject({ outcome: 'missing', written: false });
      expect(spawnMock).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    },
  );

  it('warns once when ffmpeg cannot be started', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const spawnMock = jest
      .mocked(childProcess.spawn)
      .mockImplementation(() => fakeProcess('enoent'));
    spawnMock.mockClear();
    warn.mockClear();

    await expect(
      service.createPoster(
        path.join(dir, 'clip.mp4'),
        path.join(dir, 'clip.webp'),
        'video/mp4',
      ),
    ).resolves.toEqual({
      width: null,
      height: null,
      written: false,
      undecodable: false,
      durationMs: null,
      outcome: 'missing',
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('runs at most two posters at once', async () => {
    const spawnMock = jest
      .mocked(childProcess.spawn)
      .mockImplementation(() => fakeProcess('hang'));
    spawnMock.mockClear();
    const jobs = [1, 2, 3].map((index) =>
      service.createPoster(
        path.join(dir, `${index}.mp4`),
        path.join(dir, `${index}.webp`),
        'video/mp4',
        40,
      ),
    );

    await untilSpawns(2);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    await untilSpawns(3);
    expect(spawnMock).toHaveBeenCalledTimes(3);

    await expect(Promise.all(jobs)).resolves.toEqual([
      {
        width: null,
        height: null,
        written: false,
        undecodable: false,
        durationMs: null,
        outcome: 'timeout',
      },
      {
        width: null,
        height: null,
        written: false,
        undecodable: false,
        durationMs: null,
        outcome: 'timeout',
      },
      {
        width: null,
        height: null,
        written: false,
        undecodable: false,
        durationMs: null,
        outcome: 'timeout',
      },
    ]);
  });
});
