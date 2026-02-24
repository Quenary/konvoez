import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PagedRequestDto, PagedResponseDto } from 'src/shared/dto/paged.dto';
import { MessageEntity } from './text-rooms.entity';
import { TextRoomCommon } from '@common/text-room';
import { messageMaxLength, messageMinLength } from '@common/const';

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

  static fromEntity(data: MessageEntity): MessageDto {
    return {
      id: data.id,
      senderId: data.sender.id,
      senderUsername: data.sender.username,
      recipientId: data.recipient?.id ?? null,
      roomId: data.room?.id ?? null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      content: data.content,
    };
  }
}

export class MessageListRequestDto
  extends PagedRequestDto
  implements TextRoomCommon.IListRequest
{
  @ApiProperty({ type: 'integer', required: true })
  @IsOptional()
  @IsInt()
  recipientId!: number | null;

  @ApiProperty({ type: 'integer', required: true })
  @IsOptional()
  @IsInt()
  roomId!: number | null;
}

export class MessageListResponseDto extends PagedResponseDto<MessageDto> {}
