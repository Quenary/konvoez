import {
  ApiErrorCode,
  maxAvatarSize,
  roomAvatarKeyRegexp,
} from '@konvoez/shared';
import {
  ROOM_AVATARS_BUCKET,
  type FileService,
} from '@shared/services/file.service';
import type { ImageProcessingService } from '@shared/services/image-processing.service';
import { RoomsAvatarsService } from './rooms-avatars.service';

describe('RoomsAvatarsService', () => {
  const fileService = {
    upload: jest.fn(),
  };
  const imageProcessingService = {
    convertToWebp: jest.fn(),
  };

  const service = new RoomsAvatarsService(
    fileService as unknown as FileService,
    imageProcessingService as unknown as ImageProcessingService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an avatar larger than maxAvatarSize before processing', async () => {
    const file = { size: maxAvatarSize + 1 } as Express.Multer.File;

    await expect(service.upload(file)).rejects.toMatchObject({
      code: ApiErrorCode.AVATAR_TOO_BIG,
    });
    expect(imageProcessingService.convertToWebp).not.toHaveBeenCalled();
    expect(fileService.upload).not.toHaveBeenCalled();
  });

  it('generates a UUID webp filename without user originalname', async () => {
    const file = {
      originalname: '../комната (1).png',
      size: 1024,
      buffer: Buffer.from('raw'),
      mimetype: 'image/png',
    } as Express.Multer.File;
    const processed = {
      ...file,
      originalname: '../комната (1).webp',
      mimetype: 'image/webp',
      buffer: Buffer.from('webp'),
      size: 4,
    };
    imageProcessingService.convertToWebp.mockResolvedValueOnce(processed);
    fileService.upload.mockImplementationOnce(
      async (uploaded: Express.Multer.File, bucket: string) =>
        `${bucket}/1700000000000-${uploaded.originalname}`,
    );

    const key = await service.upload(file);

    expect(fileService.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/,
        ),
        mimetype: 'image/webp',
      }),
      ROOM_AVATARS_BUCKET,
    );
    expect(key).toMatch(roomAvatarKeyRegexp);
  });
});
