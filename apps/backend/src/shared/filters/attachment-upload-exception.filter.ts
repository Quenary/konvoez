import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MulterError } from 'multer';

@Catch(MulterError)
export class AttachmentUploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    if (exception.code === 'LIMIT_FILE_SIZE') {
      const error = new PayloadTooLargeException({ message: 'FILE_TOO_BIG' });
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
      error: 'Bad Request',
    });
  }
}
