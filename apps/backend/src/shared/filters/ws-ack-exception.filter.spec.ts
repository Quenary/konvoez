import { ArgumentsHost } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsAckExceptionFilter } from './ws-ack-exception.filter';

describe('WsAckExceptionFilter', () => {
  const filter = new WsAckExceptionFilter();

  it('responds to ack callbacks with an error payload', () => {
    const ack = jest.fn();
    const host = {
      getArgs: () => [{}, {}, ack],
      switchToWs: () => ({
        getClient: () => ({ emit: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new WsException('Producer not found'), host);

    expect(ack).toHaveBeenCalledWith({ error: 'Producer not found' });
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
      message: 'boom',
    });
  });
});
