import { StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';
import type { Response } from 'express';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsAvatarsService } from './rooms-avatars.service';
import { VoiceRoomGrantsService } from '../voice-rooms/voice-room-grants.service';
import { roomAvatarQuerySchema } from './rooms.dto';

describe('RoomsController', () => {
  let controller: RoomsController;
  let roomsService: jest.Mocked<Pick<RoomsService, 'findOneAsSafeDto'>>;
  let roomsAvatarsService: jest.Mocked<Pick<RoomsAvatarsService, 'getStream'>>;
  let voiceRoomGrantsService: jest.Mocked<
    Pick<VoiceRoomGrantsService, 'grant'>
  >;
  let mockResponse: jest.Mocked<Partial<Response>>;

  beforeEach(() => {
    roomsService = {
      findOneAsSafeDto: jest.fn(),
    };
    roomsAvatarsService = {
      getStream: jest.fn(),
    };
    voiceRoomGrantsService = {
      grant: jest.fn(),
    };
    mockResponse = {
      set: jest.fn(),
    };
    controller = new RoomsController(
      roomsService as unknown as RoomsService,
      roomsAvatarsService as unknown as RoomsAvatarsService,
      voiceRoomGrantsService as unknown as VoiceRoomGrantsService,
    );
  });

  describe('getAvatar', () => {
    it('should stream the room avatar and set response headers', async () => {
      const stream = Readable.from(['image-bytes']);
      roomsAvatarsService.getStream.mockResolvedValueOnce({
        stream,
        contentType: 'image/webp',
        contentLength: 11,
      });

      const result = await controller.getAvatar(
        { key: 'rooms-avatars/123-test.webp' },
        mockResponse as Response,
      );

      expect(roomsAvatarsService.getStream).toHaveBeenCalledWith(
        'rooms-avatars/123-test.webp',
      );
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type': 'image/webp',
        'Content-Length': '11',
        'Cache-Control': 'private, max-age=86400',
      });
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('validates roomAvatarQuerySchema', () => {
      expect(() =>
        roomAvatarQuerySchema.parse({ key: 'rooms-avatars/123.webp' }),
      ).not.toThrow();
      expect(() =>
        roomAvatarQuerySchema.parse({ key: 'room-avatar.webp' }),
      ).not.toThrow();
      expect(() =>
        roomAvatarQuerySchema.parse({ key: '../etc/passwd' }),
      ).toThrow();
      expect(() =>
        roomAvatarQuerySchema.parse({
          key: 'rooms-avatars/../attachments/secret.pdf',
        }),
      ).toThrow();
      expect(() =>
        roomAvatarQuerySchema.parse({ key: 'users-avatars/user.webp' }),
      ).toThrow();
    });
  });
});
