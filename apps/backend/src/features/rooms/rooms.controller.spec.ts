import { StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';
import type { Request, Response } from 'express';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsAvatarsService } from './rooms-avatars.service';
import { VoiceRoomGrantsService } from '../voice-rooms/voice-room-grants.service';
import { roomAvatarQuerySchema } from './rooms.dto';

describe('RoomsController', () => {
  let controller: RoomsController;
  let roomsService: jest.Mocked<
    Pick<RoomsService, 'findOneAsSafeDto' | 'reorder' | 'toDto'>
  >;
  let roomsAvatarsService: jest.Mocked<Pick<RoomsAvatarsService, 'getStream'>>;
  let voiceRoomGrantsService: jest.Mocked<
    Pick<VoiceRoomGrantsService, 'grant'>
  >;
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
    roomsService = {
      findOneAsSafeDto: jest.fn(),
      reorder: jest.fn(),
      toDto: jest.fn((r) => r as never),
    };
    roomsAvatarsService = {
      getStream: jest.fn(),
    };
    voiceRoomGrantsService = {
      grant: jest.fn(),
    };
    mockResponse = {
      set: jest.fn(),
      status: jest.fn(),
      on: jest.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
      }),
      emit: (event: string) => listeners.get(event)?.(),
    };
    controller = new RoomsController(
      roomsService as unknown as RoomsService,
      roomsAvatarsService as unknown as RoomsAvatarsService,
      voiceRoomGrantsService as unknown as VoiceRoomGrantsService,
    );
  });

  describe('getAvatar', () => {
    it('should stream the room avatar, set immutable headers, and destroy stream on close', async () => {
      const stream = Readable.from(['image-bytes']);
      const destroySpy = jest.spyOn(stream, 'destroy');
      roomsAvatarsService.getStream.mockResolvedValueOnce({
        stream,
        contentType: 'image/webp',
        contentLength: 11,
      });

      const result = await controller.getAvatar(
        { key: 'rooms-avatars/123-test.webp' },
        createRequest(),
        mockResponse as unknown as Response,
      );

      expect(roomsAvatarsService.getStream).toHaveBeenCalledWith(
        'rooms-avatars/123-test.webp',
      );
      expect(mockResponse.set).toHaveBeenNthCalledWith(1, {
        'Cache-Control': 'private, max-age=31536000, immutable',
        ETag: '"rooms-avatars/123-test.webp"',
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
        { key: 'rooms-avatars/123-test.webp' },
        createRequest({ 'if-none-match': '"rooms-avatars/123-test.webp"' }),
        mockResponse as unknown as Response,
      );

      expect(result).toBeUndefined();
      expect(mockResponse.status).toHaveBeenCalledWith(304);
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Cache-Control': 'private, max-age=31536000, immutable',
        ETag: '"rooms-avatars/123-test.webp"',
        'X-Content-Type-Options': 'nosniff',
      });
      expect(roomsAvatarsService.getStream).not.toHaveBeenCalled();
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

  describe('reorder', () => {
    it('delegates reordering to service and maps to DTOs', async () => {
      const room = { id: 1, name: 'Room 1', order: 0 } as never;
      roomsService.reorder.mockResolvedValueOnce([room]);

      const result = await controller.reorder({ roomIds: [1] });

      expect(roomsService.reorder).toHaveBeenCalledWith({ roomIds: [1] });
      expect(result).toEqual([room]);
    });
  });
});
