import { createZodDto } from 'nestjs-zod';
import {
  messageCreateSchema,
  messageEditSchema,
  messageListRequestSchema,
  messageListResponseSchema,
  messageSchema,
} from '@konvoez/shared';

export class CreateMessageDto extends createZodDto(messageCreateSchema) {}

export class EditMessageDto extends createZodDto(messageEditSchema) {}

export class MessageDto extends createZodDto(messageSchema) {}

export class MessageListRequestDto extends createZodDto(
  messageListRequestSchema,
) {}

export class MessageListResponseDto extends createZodDto(
  messageListResponseSchema,
) {}
