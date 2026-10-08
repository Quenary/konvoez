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

    const message = this.resolveMessage(exception);
    this.logger.debug(`WS handler failed: ${message}`);

    if (ack) {
      ack({ error: message });
      return;
    }

    const client = host.switchToWs().getClient<{
      emit: (event: string, payload: unknown) => void;
    }>();
    client.emit('exception', { status: 'error', message });
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof WsException) {
      const error = exception.getError();
      return typeof error === 'string' ? error : JSON.stringify(error);
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = (response as { message: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
        if (Array.isArray(message)) {
          return message.join(', ');
        }
      }
    }
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'Internal server error';
  }
}
