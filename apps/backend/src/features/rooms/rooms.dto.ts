import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  roomAvatarKeySchema,
  roomCreateSchema,
  roomSchema,
  roomUpdateSchema,
} from '@konvoez/shared';

export class CreateRoomDto extends createZodDto(roomCreateSchema) {}

export class UpdateRoomDto extends createZodDto(roomUpdateSchema) {}

export class GetRoomDto extends createZodDto(roomSchema) {}

export const roomAvatarQuerySchema = z.object({
  key: roomAvatarKeySchema,
});

export class RoomAvatarQueryDto extends createZodDto(roomAvatarQuerySchema) {}
