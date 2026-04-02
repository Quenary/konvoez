import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
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
import { MessageEntity } from './text-rooms.entity';
import { TextRoomCommon } from '@common/text-room';
import { messageMaxLength, messageMinLength } from '@common/const';
import { stringify } from 'uuid';

export class CreateMessageDto implements TextRoomCommon.ICreateMessage {
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

export class EditMessageDto implements TextRoomCommon.IEditMessage {
  @ApiProperty({
    type: 'string',
    required: true,
  })
  @IsString()
  @MinLength(messageMinLength)
  @MaxLength(messageMaxLength)
  content!: string;
}

export class MessageDto implements TextRoomCommon.IMessage {
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

  @ApiProperty({ type: 'string', required: true })
  @IsDate()
  updatedAt!: Date | null;

  @ApiProperty({ type: 'string', required: true })
  @IsString()
  @MinLength(messageMinLength)
  @MaxLength(messageMaxLength)
  content!: string;
}

export class MessageListRequestDto implements TextRoomCommon.IListRequest {
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

export class MessageListResponseDto implements TextRoomCommon.IListResponse {
  @ApiProperty({ type: 'array' })
  @IsArray()
  items!: MessageDto[];
}
