import { ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ApiErrorCode } from '@konvoez/shared';
import { WsAckExceptionFilter } from './ws-ack-exception.filter';
import { AppException } from '../errors/app.exception';

describe('WsAckExceptionFilter', () => {
  const filter = new WsAckExceptionFilter();
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('maps legacy WsException string to INTERNAL and logs at warn level', () => {
    const ack = jest.fn();
    const host = {
      getArgs: () => [{}, {}, ack],
      switchToWs: () => ({
        getClient: () => ({ emit: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new WsException('Producer not found'), host);

    expect(ack).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.INTERNAL,
        message: 'Internal server error',
      },
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('responds to ack callbacks with AppException payload', () => {
    const ack = jest.fn();
    const host = {
      getArgs: () => [{}, {}, ack],
      switchToWs: () => ({
        getClient: () => ({ emit: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(
      new AppException(
        ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED,
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(ack).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED,
        message: ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED,
      },
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('masks unexpected errors on ack and logs at error level', () => {
    const ack = jest.fn();
    const host = {
      getArgs: () => [{}, {}, ack],
      switchToWs: () => ({
        getClient: () => ({ emit: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('Cannot read properties of undefined'), host);

    expect(ack).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.INTERNAL,
        message: 'Internal server error',
      },
    });
    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits exception when no ack callback is present', () => {
    const emit = jest.fn();
    const host = {
      getArgs: () => [{}, {}],
      switchToWs: () => ({
        getClient: () => ({ emit }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('boom'), host);

    expect(emit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'Internal server error',
      error: {
        code: ApiErrorCode.INTERNAL,
        message: 'Internal server error',
      },
    });
  });
});
