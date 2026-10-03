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

import { Readable } from 'stream';
import { EAttachmentKind } from '@konvoez/shared';
import { AttachmentsController } from './attachments.controller';
import { EAttachmentStatus } from './attachments.const';

describe('AttachmentsController', () => {
  const entity = {
    kind: EAttachmentKind.IMAGE,
    status: EAttachmentStatus.ATTACHED,
  };
  const attachmentsService = {
    resolveReadable: jest.fn(),
  };
  const fileService = {
    stat: jest.fn(),
    getStream: jest.fn(),
  };
  const controller = new AttachmentsController(
    attachmentsService as never,
    fileService as never,
  );
  const author = { id: 1 } as never;

  function response() {
    const headers = new Map<string, string>();
    let status = 200;
    const listeners = new Map<string, () => void>();
    return {
      headers,
      statusCode: () => status,
      setHeader: jest.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
      status: jest.fn((code: number) => {
        status = code;
      }),
      on: jest.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
      }),
      emit: (event: string) => listeners.get(event)?.(),
    };
  }

  function request(headers: Record<string, string> = {}) {
    return {
      header: (name: string) => headers[name.toLowerCase()],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    attachmentsService.resolveReadable.mockResolvedValue({
      entity,
      key: 'message-attachments/a',
      mime: 'image/png',
      downloadName: 'a.png',
    });
    fileService.stat.mockResolvedValue({ size: 1000 });
    fileService.getStream.mockImplementation(async () => ({
      stream: Readable.from(['hi']),
      contentLength: 2,
    }));
  });

  it('returns 304 when the etag matches', async () => {
    const res = response();
    const result = await controller.content(
      '00000000-0000-7000-8000-000000000001',
      undefined,
      author,
      request({
        'if-none-match': '"00000000-0000-7000-8000-000000000001"',
      }) as never,
      res as never,
    );

    expect(result).toBeUndefined();
    expect(res.statusCode()).toBe(304);
    expect(fileService.getStream).not.toHaveBeenCalled();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; sandbox",
    );
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(res.headers.get('Cache-Control')).toContain('private');
  });

  it('returns 206 with Content-Range for a byte range', async () => {
    const res = response();
    await controller.content(
      '00000000-0000-7000-8000-000000000001',
      undefined,
      author,
      request({ range: 'bytes=0-99' }) as never,
      res as never,
    );

    expect(res.statusCode()).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/1000');
    expect(fileService.getStream).toHaveBeenCalledWith(
      'message-attachments/a',
      undefined,
      { start: 0, end: 99 },
    );
  });

  it('returns 416 when the range starts past the end', async () => {
    const res = response();
    const result = await controller.content(
      '00000000-0000-7000-8000-000000000001',
      undefined,
      author,
      request({ range: 'bytes=1000-1001' }) as never,
      res as never,
    );

    expect(result).toBeUndefined();
    expect(res.statusCode()).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('forces a download when download=1', async () => {
    const res = response();
    await controller.content(
      '00000000-0000-7000-8000-000000000001',
      '1',
      author,
      request() as never,
      res as never,
    );

    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('keeps the original mime when a thumbnail falls back to the file', async () => {
    const res = response();
    await controller.thumbnail(
      '00000000-0000-7000-8000-000000000001',
      author,
      request() as never,
      res as never,
    );

    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  it('destroys the stream when the response closes', async () => {
    const stream = Readable.from(['hi']);
    const destroy = jest.spyOn(stream, 'destroy');
    fileService.getStream.mockResolvedValue({ stream, contentLength: 2 });
    const res = response();

    await controller.content(
      '00000000-0000-7000-8000-000000000001',
      undefined,
      author,
      request() as never,
      res as never,
    );
    res.emit('close');

    expect(destroy).toHaveBeenCalled();
  });
});
