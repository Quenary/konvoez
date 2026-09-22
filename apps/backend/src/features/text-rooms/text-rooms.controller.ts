import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { TextRoomsService } from './text-rooms.service';
import { Author } from '../auth/auth.decorator';
import { GetUserDto } from '../users/users.dto';
import {
  MarkReadDto,
  MessageDto,
  CreateMessageDto,
  MessageListResponseDto,
  MessageListRequestDto,
  EditMessageDto,
  UnreadCountsResponseDto,
} from './text-rooms.dto';

@Controller('text-rooms')
@UseGuards(AuthGuard)
export class TextRoomsController {
  constructor(private readonly textRoomsService: TextRoomsService) {}

  @Get('direct')
  @ApiOkResponse({
    type: GetUserDto,
    isArray: true,
    description:
      'Get list of users with whom the current user has direct messages',
  })
  async getDirectChats(@Author() author: GetUserDto): Promise<GetUserDto[]> {
    return await this.textRoomsService.getDirectChats(author);
  }

  @Get('unread-counts')
  @ApiOkResponse({
    type: UnreadCountsResponseDto,
    description: 'Get unread message counts for text rooms and direct chats',
  })
  async getUnreadCounts(
    @Author() author: GetUserDto,
  ): Promise<UnreadCountsResponseDto> {
    return await this.textRoomsService.getUnreadCounts(author);
  }

  @Post('list')
  @ApiOkResponse({
    type: MessageListResponseDto,
    description: 'Get messages list (chunked)',
  })
  async list(
    @Author() author: GetUserDto,
    @Body() body: MessageListRequestDto,
  ) {
    return await this.textRoomsService.list(author, body);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Mark messages as read' })
  async markRead(
    @Author() author: GetUserDto,
    @Body() body: MarkReadDto,
  ): Promise<void> {
    await this.textRoomsService.markRead(author, body);
  }

  @Post()
  @ApiOkResponse({
    type: MessageDto,
    description: 'Create message',
  })
  async create(@Author() author: GetUserDto, @Body() body: CreateMessageDto) {
    const message = await this.textRoomsService.create(author, body);
    return message;
  }

  @Get(':id/readers')
  @ApiOkResponse({
    type: GetUserDto,
    isArray: true,
    description: 'Get list of users who have read a message',
  })
  async getReaders(
    @Author() author: GetUserDto,
    @Param('id') id: string,
  ): Promise<GetUserDto[]> {
    return await this.textRoomsService.getReaders(author, id);
  }

  @Put(':id')
  @ApiOkResponse({
    type: MessageDto,
    description: 'Update message',
  })
  async updateMessage(
    @Author() author: GetUserDto,
    @Param('id') id: string,
    @Body() body: EditMessageDto,
  ) {
    const message = await this.textRoomsService.updateMessage(author, id, body);
    return message;
  }

  @Delete(':id')
  @ApiOkResponse({
    description: 'Delete message',
  })
  async delete(@Author() author: GetUserDto, @Param('id') id: string) {
    await this.textRoomsService.delete(author, id);
  }
}

