import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ApiOkResponse } from '@nestjs/swagger';
import { TextRoomsService } from './text-rooms.service';
import { Author } from '../auth/auth.decorator';
import { UserEntity } from '../users/users.entity';
import {
  MessageDto,
  CreateMessageDto,
  MessageListResponseDto,
  MessageListRequestDto,
  EditMessageDto,
} from './text-rooms.dto';
import { TextRoomsGateway } from './text-rooms.gateway';

@Controller('text-rooms')
@UseGuards(AuthGuard)
export class TextRoomsController {
  @Inject(TextRoomsService)
  private readonly textRoomsService!: TextRoomsService;

  @Inject(TextRoomsGateway)
  private readonly textRoomsGateway!: TextRoomsGateway;

  @Post('list')
  @ApiOkResponse({
    type: MessageListResponseDto,
    description: 'Get messages list (chunked)',
  })
  async list(
    @Author() author: UserEntity,
    @Body() body: MessageListRequestDto,
  ) {
    return await this.textRoomsService.list(author, body);
  }

  @Post()
  @ApiOkResponse({
    type: MessageDto,
    description: 'Create message',
  })
  async create(@Author() author: UserEntity, @Body() body: CreateMessageDto) {
    const message = await this.textRoomsService.create(author, body);
    this.textRoomsGateway.onMessageCreated(message);
    return message;
  }

  @Put(':id')
  @ApiOkResponse({
    type: MessageDto,
    description: 'Update message',
  })
  async updateMessage(
    @Author() author: UserEntity,
    @Param('id') id: string,
    @Body() body: EditMessageDto,
  ) {
    const message = await this.textRoomsService.updateMessage(author, id, body);
    this.textRoomsGateway.onMessageUpdated(message);
    return message;
  }

  @Delete(':id')
  @ApiOkResponse({
    description: 'Delete message',
  })
  async delete(@Author() author: UserEntity, @Param('id') id: string) {
    await this.textRoomsService.delete(author, id);
    this.textRoomsGateway.onMessageDeleted(id);
  }
}
