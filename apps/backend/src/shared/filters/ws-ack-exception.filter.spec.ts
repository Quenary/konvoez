import { ArgumentsHost, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsAckExceptionFilter } from './ws-ack-exception.filter';

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

  it('responds to ack callbacks with a WsException message', () => {
    const ack = jest.fn();
    const host = {
      getArgs: () => [{}, {}, ack],
      switchToWs: () => ({
        getClient: () => ({ emit: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new WsException('Producer not found'), host);

    expect(ack).toHaveBeenCalledWith({ error: 'Producer not found' });
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

    expect(ack).toHaveBeenCalledWith({ error: 'Internal server error' });
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
    });
  });
});
