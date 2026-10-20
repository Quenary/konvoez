import { createZodDto } from 'nestjs-zod';
import {
  markReadSchema,
  messageCreateSchema,
  messageEditSchema,
  messageListRequestSchema,
  messageListResponseSchema,
  messageReactionGroupSchema,
  messageReactionToggleSchema,
  messageSchema,
  readAllSchema,
  textRoomJoinSchema,
  unreadCountsSchema,
} from '@konvoez/shared';

export class TextRoomJoinDto extends createZodDto(textRoomJoinSchema) {}

export class CreateMessageDto extends createZodDto(messageCreateSchema) {}

export class EditMessageDto extends createZodDto(messageEditSchema) {}

export class MessageDto extends createZodDto(messageSchema) {}

export class MessageListRequestDto extends createZodDto(
  messageListRequestSchema,
) {}

export class MessageListResponseDto extends createZodDto(
  messageListResponseSchema,
) {}

export class MarkReadDto extends createZodDto(markReadSchema) {}

export class ReadAllDto extends createZodDto(readAllSchema) {}

export class UnreadCountsResponseDto extends createZodDto(unreadCountsSchema) {}

export class ToggleReactionDto extends createZodDto(
  messageReactionToggleSchema,
) {}

export class ReactionGroupDto extends createZodDto(
  messageReactionGroupSchema,
) {}
