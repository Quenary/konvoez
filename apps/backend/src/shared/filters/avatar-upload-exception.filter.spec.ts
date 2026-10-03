import { HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { MulterError } from 'multer';
import { AvatarUploadExceptionFilter } from './avatar-upload-exception.filter';

describe('AvatarUploadExceptionFilter', () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
    status.mockReturnValue({ json });
  });

  it('maps LIMIT_FILE_SIZE to 413', () => {
    new AvatarUploadExceptionFilter().catch(
      new MulterError('LIMIT_FILE_SIZE'),
      host,
    );

    const error = new PayloadTooLargeException('Avatar file is too large');
    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith(error.getResponse());
  });

  it('maps other multer errors to 400', () => {
    new AvatarUploadExceptionFilter().catch(
      new MulterError('LIMIT_UNEXPECTED_FILE', 'avatar'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
      }),
    );
  });
});
