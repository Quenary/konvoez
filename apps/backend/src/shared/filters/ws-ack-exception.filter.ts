import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { TWsAckError } from '@konvoez/shared';
import { toApiErrorResponse } from '../errors/to-api-error';

@Catch()
export class WsAckExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsAckExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const args = host.getArgs();
    const ack = args.find(
      (arg): arg is (response: TWsAckError) => void =>
        typeof arg === 'function',
    );

    const { body, logLevel } = toApiErrorResponse(exception);

    if (logLevel === 'error') {
      if (exception instanceof Error) {
        this.logger.error(exception.message, exception.stack);
      } else {
        this.logger.error(`WS handler failed: ${String(exception)}`);
      }
    } else {
      this.logger.warn(`WS handler failed: ${body.code}: ${body.message}`);
    }

    if (ack) {
      ack({ error: body });
      return;
    }

    const client = host.switchToWs().getClient<{
      emit: (event: string, payload: unknown) => void;
    }>();
    client.emit('exception', {
      status: 'error',
      message: body.message,
      error: body,
    });
  }
}
