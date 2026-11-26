import { StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';
import type { Request, Response } from 'express';
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
  let mockResponse: {
    set: jest.Mock;
    status: jest.Mock;
    on: jest.Mock;
    emit: (event: string) => void;
  };

  function createRequest(headers: Record<string, string> = {}): Request {
    return {
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
  }

  beforeEach(() => {
    const listeners = new Map<string, () => void>();
    usersService = {
      findAllAsSafeDto: jest.fn(),
      findOneAsSafeDto: jest.fn(),
    };
    usersAvatarsService = {
      getStream: jest.fn(),
    };
    mockResponse = {
      set: jest.fn(),
      status: jest.fn(),
      on: jest.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
      }),
      emit: (event: string) => listeners.get(event)?.(),
    };
    controller = new UsersController(
      usersService as unknown as UsersService,
      usersAvatarsService as unknown as UsersAvatarsService,
    );
  });

  describe('getAvatar', () => {
    it('should stream the avatar, set immutable headers, and destroy stream on close', async () => {
      const stream = Readable.from(['image-bytes']);
      const destroySpy = jest.spyOn(stream, 'destroy');
      usersAvatarsService.getStream.mockResolvedValueOnce({
        stream,
        contentType: 'image/webp',
        contentLength: 11,
      });

      const result = await controller.getAvatar(
        { key: 'users-avatars/123-test.webp' },
        createRequest(),
        mockResponse as unknown as Response,
      );

      expect(usersAvatarsService.getStream).toHaveBeenCalledWith(
        'users-avatars/123-test.webp',
      );
      expect(mockResponse.set).toHaveBeenNthCalledWith(1, {
        'Cache-Control': 'private, max-age=31536000, immutable',
        ETag: '"users-avatars/123-test.webp"',
        'X-Content-Type-Options': 'nosniff',
      });
      expect(mockResponse.set).toHaveBeenNthCalledWith(2, {
        'Content-Type': 'image/webp',
        'Content-Length': '11',
      });
      expect(result).toBeInstanceOf(StreamableFile);

      mockResponse.emit('close');
      expect(destroySpy).toHaveBeenCalled();
    });

    it('should return 304 without opening stream when If-None-Match matches ETag', async () => {
      const result = await controller.getAvatar(
        { key: 'users-avatars/123-test.webp' },
        createRequest({ 'if-none-match': '"users-avatars/123-test.webp"' }),
        mockResponse as unknown as Response,
      );

      expect(result).toBeUndefined();
      expect(mockResponse.status).toHaveBeenCalledWith(304);
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Cache-Control': 'private, max-age=31536000, immutable',
        ETag: '"users-avatars/123-test.webp"',
        'X-Content-Type-Options': 'nosniff',
      });
      expect(usersAvatarsService.getStream).not.toHaveBeenCalled();
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
