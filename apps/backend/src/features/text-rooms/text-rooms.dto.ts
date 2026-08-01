import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ITextRoomCreateMessage,
  ITextRoomEditMessage,
  ITextRoomListRequest,
  ITextRoomListResponse,
  ITextRoomMessage,
  messageMaxLength,
  messageMinLength,
} from '@konvoez/shared';

export class CreateMessageDto implements ITextRoomCreateMessage {
  @ApiProperty({
    type: 'integer',
    required: true,
  })
  @IsOptional()
  @IsInt()
  recipientId!: number | null;

  @ApiProperty({
    type: 'integer',
    required: true,
  })
  @IsOptional()
  @IsInt()
  roomId!: number | null;

  @ApiProperty({ type: String, required: true })
  @IsString()
  @MinLength(messageMinLength)
  @MaxLength(messageMaxLength)
  content!: string;
}

export class EditMessageDto implements ITextRoomEditMessage {
  @ApiProperty({
    type: 'string',
    required: true,
  })
  @IsString()
  @MinLength(messageMinLength)
  @MaxLength(messageMaxLength)
  content!: string;
}

export class MessageDto implements ITextRoomMessage {
  @ApiProperty({ type: 'string', required: true })
  @IsUUID()
  id!: string;

  @ApiProperty({ type: 'integer', required: true })
  @IsInt()
  senderId!: number;

  @ApiProperty({ type: 'string', required: true })
  @IsString()
  senderUsername!: string;

  @ApiProperty({ type: 'integer', required: true })
  @IsInt()
  recipientId!: number | null;

  @ApiProperty({ type: 'integer', required: true })
  @IsInt()
  roomId!: number | null;

  @ApiProperty({ type: 'string', required: true })
  @IsDate()
  createdAt!: Date;

  @ApiProperty({ type: 'string' })
  @IsDate()
  @IsOptional()
  updatedAt: Date | null | undefined;

  @ApiProperty({ type: 'string', required: true })
  @IsString()
  @MinLength(messageMinLength)
  @MaxLength(messageMaxLength)
  content!: string;
}

export class MessageListRequestDto implements ITextRoomListRequest {
  @ApiProperty({ type: 'string', required: false })
  @IsOptional()
  @IsString()
  afterId!: string | null;

  @ApiProperty({ type: 'string', required: false })
  @IsOptional()
  @IsString()
  beforeId!: string | null;

  @ApiProperty({ type: 'integer', required: true })
  @IsInt()
  @Min(1)
  @Max(1000)
  limit!: number;

  @ApiProperty({ type: 'integer', required: false })
  @IsOptional()
  @IsInt()
  recipientId!: number | null;

  @ApiProperty({ type: 'integer', required: false })
  @IsOptional()
  @IsInt()
  roomId!: number | null;
}

export class MessageListResponseDto implements ITextRoomListResponse {
  @ApiProperty({ type: 'array' })
  @IsArray()
  items!: MessageDto[];
}
