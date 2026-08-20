import { createZodDto } from 'nestjs-zod';
import {
  roomCreateSchema,
  roomSchema,
  roomUpdateSchema,
} from '@konvoez/shared';

export class CreateRoomDto extends createZodDto(roomCreateSchema) {}

export class UpdateRoomDto extends createZodDto(roomUpdateSchema) {}

export class GetRoomDto extends createZodDto(roomSchema) {}
