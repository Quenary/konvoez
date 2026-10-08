import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Catch()
export class WsAckExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsAckExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const args = host.getArgs();
    const ack = args.find(
      (arg): arg is (response: { error: string }) => void =>
        typeof arg === 'function',
    );

    const { clientMessage, logLevel } = this.resolveClientResponse(exception);

    if (logLevel === 'error') {
      if (exception instanceof Error) {
        this.logger.error(exception.message, exception.stack);
      } else {
        this.logger.error(`WS handler failed: ${String(exception)}`);
      }
    } else {
      this.logger.warn(`WS handler failed: ${clientMessage}`);
    }

    if (ack) {
      ack({ error: clientMessage });
      return;
    }

    const client = host.switchToWs().getClient<{
      emit: (event: string, payload: unknown) => void;
    }>();
    client.emit('exception', { status: 'error', message: clientMessage });
  }

  private resolveClientResponse(exception: unknown): {
    clientMessage: string;
    logLevel: 'warn' | 'error';
  } {
    if (exception instanceof WsException) {
      const error = exception.getError();
      const clientMessage =
        typeof error === 'string' ? error : JSON.stringify(error);
      return { clientMessage, logLevel: 'warn' };
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { clientMessage: response, logLevel: 'warn' };
      }
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = (response as { message: unknown }).message;
        if (typeof message === 'string') {
          return { clientMessage: message, logLevel: 'warn' };
        }
        if (Array.isArray(message)) {
          return { clientMessage: message.join(', '), logLevel: 'warn' };
        }
      }
    }
    return { clientMessage: 'Internal server error', logLevel: 'error' };
  }
}
