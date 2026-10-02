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
    })),
    {
      __middleware: middleware,
      diskStorage: jest.fn().mockReturnValue({}),
    },
  );
  return { __esModule: true, default: multer };
});

import { lastValueFrom, of, throwError } from 'rxjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  PayloadTooLargeException,
  type ExecutionContext,
} from '@nestjs/common';
import { ESettingKey, attachmentsMaxPendingPerUser } from '@konvoez/shared';
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
    file?: { path: string };
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
    req.headers['content-length'] = String(1024 + 64 * 1024 + 1);

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(multerMock).not.toHaveBeenCalled();
  });

  it('configures multer with utf8 names and the current file size limit', async () => {
    await lastValueFrom(
      await interceptor.intercept(context(), { handle: () => of('ok') }),
    );

    expect(multerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defParamCharset: 'utf8',
        limits: { fileSize: 1024, files: 1, fields: 0, parts: 1 },
      }),
    );
  });

  it('unlinks the temp file when the handler fails', async () => {
    const filePath = path.join(appService.UPLOAD_TMP_DIR, 'partial');
    fs.writeFileSync(filePath, 'data');
    multerMock.__middleware.mockImplementation(
      (request, _response, callback) => {
        (request as { file?: { path: string } }).file = { path: filePath };
        callback();
      },
    );

    const rm = jest.spyOn(fs.promises, 'rm');
    const observable = await interceptor.intercept(context(), {
      handle: () => throwError(() => new Error('handler failed')),
    });
    await expect(lastValueFrom(observable)).rejects.toThrow('handler failed');
    await rm.mock.results[0]?.value;
    expect(rm).toHaveBeenCalledWith(filePath, { force: true });
    expect(fs.existsSync(filePath)).toBe(false);
    rm.mockRestore();
  });

  it('maps a full disk during the upload to 507', async () => {
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(Object.assign(new Error('no space'), { code: 'ENOSPC' }));
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toMatchObject({ message: 'STORAGE_FULL', status: 507 });
  });

  it('maps a client abort to a bad request', async () => {
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(new Error('Request aborted'));
      },
    );

    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBeInstanceOf(BadRequestException);

    req.destroyed = true;
    multerMock.__middleware.mockImplementation(
      (_request, _response, callback) => {
        callback(new Error('socket hang up'));
      },
    );
    await expect(
      interceptor.intercept(context(), { handle: () => of(null) }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
        (request as { file?: { path: string } }).file = { path: filePath };
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
