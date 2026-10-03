import { spawn } from 'child_process';
import fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { Semaphore } from 'async-mutex';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import {
  attachmentsMaxImagePixels,
  attachmentsThumbnailMaxSide,
} from '@konvoez/shared';

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

export interface IVideoPoster {
  readonly width: number | null;
  readonly height: number | null;
  readonly written: boolean;
  readonly undecodable: boolean;
}

interface ICommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

type TFrameGrab = 'frame' | 'none' | 'timeout';

const skippedPoster = {
  width: null,
  height: null,
  written: false,
  undecodable: false,
} as const satisfies IVideoPoster;

export function resolveFfmpegBinary(): string {
  const override = process.env['FFMPEG_PATH'];
  if (override !== undefined && override.trim() !== '') {
    return override;
  }
  if (typeof ffmpegStatic === 'string' && ffmpegStatic !== '') {
    return ffmpegStatic;
  }
  return 'ffmpeg';
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
      return skippedPoster;
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
      if (framed === 'timeout') {
        await fs.promises.rm(destPath, { force: true });
        this.logger.warn('Video poster skipped: frame grab timed out');
        return skippedPoster;
      }
      if (framed === 'none') {
        await fs.promises.rm(destPath, { force: true });
        this.logger.warn('Video poster skipped: no frame could be read');
        return {
          width: null,
          height: null,
          written: false,
          undecodable: true,
        };
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
      return {
        width: info.width ?? null,
        height: info.height ?? null,
        written: true,
        undecodable: false,
      };
    } catch (error) {
      await fs.promises.rm(destPath, { force: true });
      if (isEnoent(error)) {
        this.noteMissingBinary();
        return skippedPoster;
      }
      if (isEnospc(error)) {
        throw error;
      }
      this.logger.warn(
        `Video poster skipped: ${error instanceof Error ? error.message : error}`,
      );
      return skippedPoster;
    } finally {
      await fs.promises.rm(framePath, { force: true });
    }
  }

  private async extractFrame(
    sourcePath: string,
    framePath: string,
    format: string,
    deadline: number,
  ): Promise<TFrameGrab> {
    const binary = resolveFfmpegBinary();
    for (const seek of [1, 0]) {
      await fs.promises.rm(framePath, { force: true });
      let result: ICommandResult;
      try {
        result = await runCommand(
          binary,
          [
            '-hide_banner',
            '-loglevel',
            'error',
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
          return 'timeout';
        }
        throw error;
      }
      assertPosterStorage(result.stderr);
      if (result.code !== 0) {
        continue;
      }
      try {
        const stat = await fs.promises.stat(framePath);
        if (stat.size > 0) {
          return 'frame';
        }
      } catch {
        continue;
      }
    }
    return 'none';
  }

  private noteMissingBinary(): void {
    if (this.loggedMissingBinary) {
      return;
    }
    this.loggedMissingBinary = true;
    this.logger.warn(
      'ffmpeg is not installed; video posters are skipped. Set FFMPEG_PATH or install ffmpeg-static.',
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

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function isEnospc(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOSPC'
  );
}
