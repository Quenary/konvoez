import { spawn } from 'child_process';
import fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { Semaphore } from 'async-mutex';
import sharp from 'sharp';
import {
  attachmentsMaxImagePixels,
  attachmentsMaxVideoDurationSeconds,
  attachmentsThumbnailMaxSide,
} from '@konvoez/shared';
import { isEnospc } from '@shared/utils/is-enospc';

const POSTER_DEADLINE_MS = 15_000;
const VIDEO_PROCESSING_SLOTS = 2;
const OUTPUT_LIMIT = 1024 * 1024;
const COMMAND_ENV_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LD_LIBRARY_PATH',
] as const;
const INPUT_FORMAT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export type TVideoPosterOutcome =
  'frame' | 'timeout' | 'missing' | 'failed' | 'undecodable' | 'skipped';

export interface IVideoPoster {
  readonly width: number | null;
  readonly height: number | null;
  readonly written: boolean;
  readonly undecodable: boolean;
  readonly durationMs: number | null;
  readonly outcome: TVideoPosterOutcome;
}

interface ICommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

type TFrameGrab = 'frame' | 'none' | 'timeout' | 'missing' | 'failed';

interface IFrameGrab {
  readonly status: TFrameGrab;
  readonly durationMs: number | null;
}

function posterResult(
  outcome: TVideoPosterOutcome,
  extra: Partial<IVideoPoster> = {},
): IVideoPoster {
  return {
    width: null,
    height: null,
    written: false,
    undecodable: outcome === 'undecodable',
    durationMs: null,
    outcome,
    ...extra,
  };
}

export function resolveFfmpegBinary(): string {
  const override = process.env['FFMPEG_PATH'];
  if (override !== undefined && override.trim() !== '') {
    return override;
  }
  return 'ffmpeg';
}

export function parseFfmpegDurationMs(stderr: string): number | null {
  const match = /Duration:\s+(?:N\/A|(\d+):(\d+):(\d+(?:\.\d+)?))/.exec(stderr);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes >= 60 || seconds >= 60) {
    return null;
  }
  const durationMs = Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > attachmentsMaxVideoDurationSeconds * 1000
  ) {
    return null;
  }
  return durationMs;
}

export function videoInputFormat(mime: string): string | null {
  return INPUT_FORMAT_BY_MIME[mime] ?? null;
}

export function assertPosterStorage(stderr: string): void {
  if (!stderr.includes('No space left on device')) {
    return;
  }
  throw Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
}

@Injectable()
export class VideoProcessingService {
  private readonly slots = new Semaphore(VIDEO_PROCESSING_SLOTS);
  private readonly logger = new Logger(VideoProcessingService.name);
  private loggedMissingBinary = false;

  public async createPoster(
    sourcePath: string,
    destPath: string,
    mime: string,
    deadlineMs = POSTER_DEADLINE_MS,
  ): Promise<IVideoPoster> {
    const format = videoInputFormat(mime);
    if (!format) {
      return posterResult('skipped');
    }
    return this.slots.runExclusive(() =>
      this.writePoster(sourcePath, destPath, format, deadlineMs),
    );
  }

  private async writePoster(
    sourcePath: string,
    destPath: string,
    format: string,
    deadlineMs: number,
  ): Promise<IVideoPoster> {
    const framePath = `${destPath}.frame.jpg`;
    const deadline = Date.now() + deadlineMs;
    try {
      const framed = await this.extractFrame(
        sourcePath,
        framePath,
        format,
        deadline,
      );
      if (framed.status === 'timeout') {
        await fs.promises.rm(destPath, { force: true });
        this.logger.warn('Video poster skipped: frame grab timed out');
        return posterResult('timeout');
      }
      if (framed.status === 'missing') {
        await fs.promises.rm(destPath, { force: true });
        this.noteMissingBinary();
        return posterResult('missing');
      }
      if (framed.status === 'failed') {
        await fs.promises.rm(destPath, { force: true });
        this.logger.warn('Video poster skipped: ffmpeg failed');
        return posterResult('failed');
      }
      if (framed.status === 'none') {
        await fs.promises.rm(destPath, { force: true });
        this.logger.warn('Video poster skipped: no frame could be read');
        return posterResult('undecodable');
      }
      const info = await sharp(framePath, {
        failOn: 'error',
        limitInputPixels: attachmentsMaxImagePixels,
      })
        .resize({
          width: attachmentsThumbnailMaxSide,
          height: attachmentsThumbnailMaxSide,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(destPath);
      return posterResult('frame', {
        width: info.width ?? null,
        height: info.height ?? null,
        written: true,
        undecodable: false,
        durationMs: framed.durationMs,
      });
    } catch (error) {
      await fs.promises.rm(destPath, { force: true });
      if (isMissingBinary(error)) {
        this.noteMissingBinary();
        return posterResult('missing');
      }
      if (isEnospc(error)) {
        throw error;
      }
      this.logger.warn(
        `Video poster skipped: ${error instanceof Error ? error.message : error}`,
      );
      return posterResult('failed');
    } finally {
      await fs.promises.rm(framePath, { force: true });
    }
  }

  private async extractFrame(
    sourcePath: string,
    framePath: string,
    format: string,
    deadline: number,
  ): Promise<IFrameGrab> {
    const binary = resolveFfmpegBinary();
    let failed = false;
    let empty = false;
    for (const seek of [1, 0]) {
      await fs.promises.rm(framePath, { force: true });
      let result: ICommandResult;
      try {
        result = await runCommand(
          binary,
          [
            '-hide_banner',
            '-loglevel',
            'info',
            '-nostdin',
            '-threads',
            '1',
            '-filter_threads',
            '1',
            '-protocol_whitelist',
            'file',
            '-ss',
            String(seek),
            '-f',
            format,
            '-i',
            sourcePath,
            '-map',
            '0:V:0',
            '-an',
            '-frames:v',
            '1',
            '-q:v',
            '5',
            '-y',
            framePath,
          ],
          deadline - Date.now(),
        );
      } catch (error) {
        if (error instanceof CommandTimeoutError) {
          return { status: 'timeout', durationMs: null };
        }
        if (isMissingBinary(error)) {
          return { status: 'missing', durationMs: null };
        }
        throw error;
      }
      assertPosterStorage(result.stderr);
      if (result.code !== 0) {
        failed = true;
        continue;
      }
      try {
        const stat = await fs.promises.stat(framePath);
        if (stat.size > 0) {
          return {
            status: 'frame',
            durationMs: parseFfmpegDurationMs(result.stderr),
          };
        }
      } catch {
        empty = true;
        continue;
      }
      empty = true;
    }
    if (empty) {
      return { status: 'none', durationMs: null };
    }
    if (failed) {
      return { status: 'failed', durationMs: null };
    }
    return { status: 'none', durationMs: null };
  }

  private noteMissingBinary(): void {
    if (this.loggedMissingBinary) {
      return;
    }
    this.loggedMissingBinary = true;
    this.logger.warn(
      'ffmpeg is not installed; video posters are skipped. Set FFMPEG_PATH or install ffmpeg.',
    );
  }
}

class CommandTimeoutError extends Error {
  constructor() {
    super('timed out');
  }
}

function runCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ICommandResult> {
  if (timeoutMs <= 0) {
    return Promise.reject(new CommandTimeoutError());
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: commandEnv(),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let settled = false;
    let timedOut = false;
    const finish = (error: Error | null, result?: ICommandResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      if (result) {
        resolve(result);
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutLength += chunk.length;
      if (stdoutLength > OUTPUT_LIMIT) {
        child.kill('SIGKILL');
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrLength += chunk.length;
      if (stderrLength > OUTPUT_LIMIT) {
        child.kill('SIGKILL');
        return;
      }
      stderr.push(chunk);
    });
    child.on('error', (error) => {
      finish(error);
    });
    child.on('close', (code) => {
      const stderrText = Buffer.concat(stderr).toString('utf8');
      if (stderrText.includes('No space left on device')) {
        finish(
          Object.assign(new Error('No space left on device'), {
            code: 'ENOSPC',
          }),
        );
        return;
      }
      if (timedOut) {
        finish(new CommandTimeoutError());
        return;
      }
      finish(null, {
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: stderrText,
      });
    });
  });
}

function commandEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of COMMAND_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

function isMissingBinary(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' ||
      error.code === 'EACCES' ||
      error.code === 'ENOEXEC')
  );
}
