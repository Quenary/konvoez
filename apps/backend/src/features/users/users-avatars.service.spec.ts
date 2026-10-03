import { PayloadTooLargeException } from '@nestjs/common';
import { maxAvatarSize } from '@konvoez/shared';
import type { FileService } from '@shared/services/file.service';
import type { ImageProcessingService } from '@shared/services/image-processing.service';
import { UsersAvatarsService } from './users-avatars.service';

describe('UsersAvatarsService', () => {
  const fileService = {
    upload: jest.fn(),
  };
  const imageProcessingService = {
    convertToWebp: jest.fn(),
  };

  const service = new UsersAvatarsService(
    fileService as unknown as FileService,
    imageProcessingService as unknown as ImageProcessingService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an avatar larger than maxAvatarSize before processing', async () => {
    const file = { size: maxAvatarSize + 1 } as Express.Multer.File;

    await expect(service.upload(file)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    expect(imageProcessingService.convertToWebp).not.toHaveBeenCalled();
    expect(fileService.upload).not.toHaveBeenCalled();
  });
});
