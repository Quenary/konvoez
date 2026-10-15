import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { toApiErrorResponse } from '../errors/to-api-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { status, body, logLevel } = toApiErrorResponse(exception);

    if (logLevel === 'error') {
      if (exception instanceof Error) {
        this.logger.error(exception.message, exception.stack);
      } else {
        this.logger.error(`HTTP request failed: ${String(exception)}`);
      }
    } else {
      this.logger.warn(
        `HTTP request failed: [${status}] ${body.code}: ${body.message}`,
      );
    }

    response.status(status).json(body);
  }
}
