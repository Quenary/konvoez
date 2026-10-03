import { spawn } from 'child_process';
import fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { Semaphore } from 'async-mutex';
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

export interface IVideoDisplaySize {
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number | null;
}

export interface IVideoPoster {
  readonly width: number | null;
  readonly height: number | null;
  readonly written: boolean;
}

interface ICommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function posterSeekSeconds(
  durationSeconds: number | null,
): readonly number[] {
  if (durationSeconds !== null && durationSeconds < 1) {
    return [0];
  }
  return [1, 0];
}

export function videoInputFormat(mime: string): string | null {
  return INPUT_FORMAT_BY_MIME[mime] ?? null;
}

export function videoDisplaySize(payload: string): IVideoDisplaySize | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  if (!root) {
    return null;
  }
  const streams = root['streams'];
  if (!Array.isArray(streams)) {
    return null;
  }
  const stream = asRecord(streams[0]);
  if (!stream) {
    return null;
  }
  const width = positive(stream['width']);
  const height = positive(stream['height']);
  if (width === null || height === null) {
    return null;
  }
  const rotation = rotationOf(stream);
  const swapped = rotation === 90 || rotation === 270;
  return {
    width: swapped ? height : width,
    height: swapped ? width : height,
    durationSeconds: durationOf(root, stream),
  };
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
      return { width: null, height: null, written: false };
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
    let width: number | null = null;
    let height: number | null = null;
    try {
      const probed = await this.probe(sourcePath, format, deadline);
      width = probed?.width ?? null;
      height = probed?.height ?? null;
      const framed = await this.extractFrame(
        sourcePath,
        framePath,
        format,
        posterSeekSeconds(probed?.durationSeconds ?? null),
        deadline,
      );
      if (!framed) {
        await fs.promises.rm(destPath, { force: true });
        this.logger.warn('Video poster skipped: no frame could be read');
        return { width, height, written: false };
      }
      await sharp(framePath, {
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
      return { width, height, written: true };
    } catch (error) {
      await fs.promises.rm(destPath, { force: true });
      if (isEnoent(error)) {
        this.noteMissingBinary('ffmpeg');
        return { width, height, written: false };
      }
      if (isEnospc(error)) {
        throw error;
      }
      this.logger.warn(
        `Video poster skipped: ${error instanceof Error ? error.message : error}`,
      );
      return { width, height, written: false };
    } finally {
      await fs.promises.rm(framePath, { force: true });
    }
  }

  private async probe(
    sourcePath: string,
    format: string,
    deadline: number,
  ): Promise<IVideoDisplaySize | null> {
    try {
      const result = await runCommand(
        'ffprobe',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-protocol_whitelist',
          'file',
          '-probesize',
          '5000000',
          '-analyzeduration',
          '5000000',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height,duration:stream_tags=rotate:stream_side_data=rotation:format=duration',
          '-of',
          'json',
          '-f',
          format,
          sourcePath,
        ],
        deadline - Date.now(),
      );
      assertPosterStorage(result.stderr);
      if (result.code !== 0) {
        return null;
      }
      return videoDisplaySize(result.stdout);
    } catch (error) {
      if (isEnoent(error)) {
        this.noteMissingBinary('ffprobe');
        return null;
      }
      throw error;
    }
  }

  private async extractFrame(
    sourcePath: string,
    framePath: string,
    format: string,
    seeks: readonly number[],
    deadline: number,
  ): Promise<boolean> {
    for (const seek of seeks) {
      await fs.promises.rm(framePath, { force: true });
      const result = await runCommand(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          'file',
          '-ss',
          String(seek),
          '-f',
          format,
          '-i',
          sourcePath,
          '-an',
          '-frames:v',
          '1',
          '-vf',
          `scale='min(${attachmentsThumbnailMaxSide},iw)':'min(${attachmentsThumbnailMaxSide},ih)':force_original_aspect_ratio=decrease`,
          '-q:v',
          '5',
          '-y',
          framePath,
        ],
        deadline - Date.now(),
      );
      assertPosterStorage(result.stderr);
      if (result.code !== 0) {
        continue;
      }
      try {
        const stat = await fs.promises.stat(framePath);
        if (stat.size > 0) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  private noteMissingBinary(command: string): void {
    if (this.loggedMissingBinary) {
      return;
    }
    this.loggedMissingBinary = true;
    this.logger.warn(
      `${command} is not installed; video posters are skipped. Install the ffmpeg package.`,
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function positive(value: unknown): number | null {
  const parsed = readNumber(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function rotationOf(stream: Record<string, unknown>): number {
  const sideData = stream['side_data_list'];
  if (Array.isArray(sideData)) {
    for (const item of sideData) {
      const record = asRecord(item);
      const rotation = record ? readNumber(record['rotation']) : null;
      if (rotation !== null) {
        return normalizeDegrees(rotation);
      }
    }
  }
  const tags = asRecord(stream['tags']);
  const rotate = tags ? readNumber(tags['rotate']) : null;
  return rotate === null ? 0 : normalizeDegrees(rotate);
}

function normalizeDegrees(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

function durationOf(
  root: Record<string, unknown>,
  stream: Record<string, unknown>,
): number | null {
  const streamDuration = readNumber(stream['duration']);
  if (streamDuration !== null && streamDuration >= 0) {
    return streamDuration;
  }
  const format = asRecord(root['format']);
  const formatDuration = format ? readNumber(format['duration']) : null;
  if (formatDuration !== null && formatDuration >= 0) {
    return formatDuration;
  }
  return null;
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
