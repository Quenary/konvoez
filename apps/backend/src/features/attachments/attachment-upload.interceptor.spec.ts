jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@mikro-orm/core', () => {
  const createProxy = (): unknown =>
    new Proxy(() => createProxy(), {
      get: () => createProxy(),
      apply: () => createProxy(),
    });
  return {
    defineEntity: () => ({
      class: class {},
      setClass: () => undefined,
      addHook: () => undefined,
    }),
    p: createProxy(),
  };
});
jest.mock('multer', () => {
  class MulterError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.name = 'MulterError';
      this.code = code;
    }
  }

  const middleware = jest.fn(
    (
      _req: unknown,
      _res: unknown,
      callback: (error?: unknown) => void,
    ): void => {
      callback();
    },
  );
  const multer = Object.assign(
    jest.fn(() => ({
      single: () => middleware,
      fields: () => middleware,
    })),
    {
      __middleware: middleware,
      diskStorage: jest.fn().mockReturnValue({}),
    },
  );
  return { __esModule: true, default: multer, MulterError };
});

import { lastValueFrom, of, throwError } from 'rxjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer, { MulterError } from 'multer';
import {
  ForbiddenException,
  HttpException,
  Logger,
  PayloadTooLargeException,
  type ExecutionContext,
} from '@nestjs/common';
import {
  EAttachmentUploadError,
  ESettingKey,
  attachmentsMaxPendingPerUser,
} from '@konvoez/shared';
import { AttachmentUploadInterceptor } from './attachment-upload.interceptor';
import { EAttachmentStatus } from './attachments.const';

const multerMock = multer as unknown as jest.Mock & {
  __middleware: jest.Mock;
};

describe('AttachmentUploadInterceptor', () => {
  const settingsService = {
    getValue: jest.fn(),
  };
  const appService = {
    UPLOAD_TMP_DIR: '',
  };
  const repo = {
    count: jest.fn(),
  };
  let interceptor: AttachmentUploadInterceptor;
  let req: {
    headers: Record<string, string>;
    author?: { id: number };
    files?: {
      file?: { path: string; size: number }[];
      poster?: { path: string; size: number }[];
    };
    destroyed?: boolean;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    appService.UPLOAD_TMP_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'konvoez-upload-'),
    );
    settingsService.getValue.mockImplementation(async (key: ESettingKey) => {
      if (key === ESettingKey.ATTACHMENTS_ENABLED) {
        return true;
      }
      if (key === ESettingKey.ATTACHMENTS_MAX_FILE_SIZE) {
        return 1024;
      }
      return null;
    });
    repo.count.mockResolvedValue(0);
    req = { headers: {}, author: { id: 7 } };
    interceptor = new AttachmentUploadInterceptor(
      settingsService as never,
      appService as never,
      repo as never,
    );
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback();
      },
    );
  });

  afterEach(() => {
    fs.rmSync(appService.UPLOAD_TMP_DIR, { recursive: true, force: true });
  });

  function context(): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
      }),
    } as ExecutionContext;
  }

  it('rejects uploads when attachments are disabled', async () => {
    settingsService.getValue.mockImplementation(async (key: ESettingKey) =>
      key === ESettingKey.ATTACHMENTS_ENABLED ? false : 1024,
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(multerMock).not.toHaveBeenCalled();
  });

  it('rejects when the user has too many pending uploads', async () => {
    repo.count.mockResolvedValue(attachmentsMaxPendingPerUser);

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({
      message: 'ATTACHMENTS_PENDING_LIMIT',
      status: 429,
    });
    expect(repo.count).toHaveBeenCalledWith({
      uploader: 7,
      status: EAttachmentStatus.PENDING,
    });
    expect(multerMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized Content-Length before multer runs', async () => {
    req.headers['content-length'] = String(
      1024 + 2 * 1024 * 1024 + 64 * 1024 + 1,
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(multerMock).not.toHaveBeenCalled();
  });

  it('rejects an empty body before multer runs', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    req.headers['content-length'] = '0';
    req.headers['user-agent'] = 'Safari';

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({
      message: EAttachmentUploadError.EMPTY,
      status: 400,
    });
    expect(multerMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Safari'));
    warn.mockRestore();
  });

  it('configures multer with utf8 names and the current file size limit', async () => {
    await lastValueFrom(
      await interceptor.intercept(context(), { handle: () => of('ok') }),
    );

    expect(multerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defParamCharset: 'utf8',
        limits: {
          fileSize: 2 * 1024 * 1024,
          files: 2,
          fields: 3,
          fieldSize: 256,
          parts: 5,
        },
      }),
    );
  });

  it('unlinks the temp file when the handler fails', async () => {
    const filePath = path.join(appService.UPLOAD_TMP_DIR, 'partial');
    const posterPath = path.join(appService.UPLOAD_TMP_DIR, 'poster');
    fs.writeFileSync(filePath, 'data');
    fs.writeFileSync(posterPath, 'poster');
    multerMock.__middleware.mockImplementation(
      (request, _response, callback) => {
        (
          request as {
            files?: {
              file?: { path: string; size: number }[];
              poster?: { path: string; size: number }[];
            };
          }
        ).files = {
          file: [{ path: filePath, size: 4 }],
          poster: [{ path: posterPath, size: 6 }],
        };
        callback();
      },
    );

    const rm = jest.spyOn(fs.promises, 'rm');
    const observable = await interceptor.intercept(context(), {
      handle: () => throwError(() => new Error('handler failed')),
    });
    await expect(lastValueFrom(observable)).rejects.toThrow('handler failed');
    await Promise.all(rm.mock.results.map((r) => r.value));
    expect(rm).toHaveBeenCalledWith(filePath, { force: true });
    expect(rm).toHaveBeenCalledWith(posterPath, { force: true });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(posterPath)).toBe(false);
    rm.mockRestore();
  });

  it('maps a full disk during the upload to 507', async () => {
    req.destroyed = true;
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(Object.assign(new Error('no space'), { code: 'ENOSPC' }));
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({ message: 'STORAGE_FULL', status: 507 });
  });

  it('forwards MulterError when the request is already destroyed', async () => {
    req.destroyed = true;
    const sizeError = new MulterError('LIMIT_FILE_SIZE');
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(sizeError);
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBe(sizeError);

    const countError = new MulterError('LIMIT_FILE_COUNT');
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(countError);
      },
    );
    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBe(countError);
  });

  it('maps a client abort to a bad request', async () => {
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(new Error('Request aborted'));
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({ message: 'UPLOAD_ABORTED' });
  });

  it('maps a closed request to a bad request', async () => {
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(new Error('Request closed'));
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({ message: 'UPLOAD_ABORTED', status: 400 });
  });

  it.each([
    'Unexpected end of form',
    'Unexpected end of file',
    'Malformed part header',
    'Multipart: Boundary not found',
  ])('maps the busboy error "%s" to a bad request', async (message) => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    req.headers['content-length'] = '1234';
    req.headers['user-agent'] = 'Safari';
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(Object.assign(new Error(message), { storageErrors: [] }));
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({
      message: EAttachmentUploadError.MALFORMED,
      status: 400,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/contentLength=1234.*userAgent=Safari/),
    );
    warn.mockRestore();
  });

  it('removes temp files of an upload that failed mid-write', async () => {
    const diskStorage = multer.diskStorage as unknown as jest.Mock;
    let tempPath = '';
    multerMock.__middleware.mockImplementation(
      (request, _response, callback) => {
        const options = diskStorage.mock.calls.at(-1)?.[0] as {
          filename: (
            request: unknown,
            file: unknown,
            callback: (error: Error | null, name: string) => void,
          ) => void;
        };
        options.filename(request, {}, (_error, name) => {
          tempPath = path.join(appService.UPLOAD_TMP_DIR, name);
          fs.writeFileSync(tempPath, '');
        });
        callback(new Error('Unexpected end of form'));
      },
    );
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const rm = jest.spyOn(fs.promises, 'rm');

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({ message: EAttachmentUploadError.MALFORMED });
    await Promise.all(rm.mock.results.map((r) => r.value));

    expect(tempPath).not.toBe('');
    expect(rm).toHaveBeenCalledWith(tempPath, { force: true });
    expect(fs.existsSync(tempPath)).toBe(false);
    rm.mockRestore();
    warn.mockRestore();
  });

  it('does not treat a destroyed request as an abort', async () => {
    req.destroyed = true;
    const error = new Error('socket hang up');
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(error);
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBe(error);
  });

  it('logs a temp-file removal failure without an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on('unhandledRejection', onUnhandled);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const filePath = path.join(appService.UPLOAD_TMP_DIR, 'locked');
    multerMock.__middleware.mockImplementation(
      (request, _response, callback) => {
        (
          request as {
            files?: { file?: { path: string; size: number }[] };
          }
        ).files = { file: [{ path: filePath, size: 1 }] };
        callback();
      },
    );
    jest
      .spyOn(fs.promises, 'rm')
      .mockRejectedValueOnce(
        Object.assign(new Error('denied'), { code: 'EACCES' }),
      );

    const observable = await interceptor.intercept(context(), {
      handle: () => of('ok'),
    });
    await lastValueFrom(observable);
    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    jest.spyOn(fs.promises, 'rm').mockRestore();
    process.off('unhandledRejection', onUnhandled);
  });
});
