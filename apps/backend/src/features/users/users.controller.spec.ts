import { StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';
import type { Response } from 'express';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersAvatarsService } from './users-avatars.service';
import { userAvatarQuerySchema } from './users.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findAllAsSafeDto' | 'findOneAsSafeDto'>
  >;
  let usersAvatarsService: jest.Mocked<Pick<UsersAvatarsService, 'getStream'>>;
  let mockResponse: jest.Mocked<Partial<Response>>;

  beforeEach(() => {
    usersService = {
      findAllAsSafeDto: jest.fn(),
      findOneAsSafeDto: jest.fn(),
    };
    usersAvatarsService = {
      getStream: jest.fn(),
    };
    mockResponse = {
      set: jest.fn(),
    };
    controller = new UsersController(
      usersService as unknown as UsersService,
      usersAvatarsService as unknown as UsersAvatarsService,
    );
  });

  describe('getAvatar', () => {
    it('should stream the avatar and set response headers', async () => {
      const stream = Readable.from(['image-bytes']);
      usersAvatarsService.getStream.mockResolvedValueOnce({
        stream,
        contentType: 'image/webp',
        contentLength: 11,
      });

      const result = await controller.getAvatar(
        { key: 'users-avatars/123-test.webp' },
        mockResponse as Response,
      );

      expect(usersAvatarsService.getStream).toHaveBeenCalledWith(
        'users-avatars/123-test.webp',
      );
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type': 'image/webp',
        'Content-Length': '11',
        'Cache-Control': 'private, max-age=86400',
      });
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('validates userAvatarQuerySchema', () => {
      expect(() =>
        userAvatarQuerySchema.parse({ key: 'users-avatars/123.webp' }),
      ).not.toThrow();
      expect(() =>
        userAvatarQuerySchema.parse({ key: 'avatar.png' }),
      ).not.toThrow();
      expect(() =>
        userAvatarQuerySchema.parse({ key: '../etc/passwd' }),
      ).toThrow();
      expect(() =>
        userAvatarQuerySchema.parse({
          key: 'users-avatars/../attachments/secret.pdf',
        }),
      ).toThrow();
      expect(() =>
        userAvatarQuerySchema.parse({ key: 'rooms-avatars/room.webp' }),
      ).toThrow();
    });
  });
});
