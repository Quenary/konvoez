import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ApiOkResponse } from '@nestjs/swagger';
import { TextRoomsService } from './text-rooms.service';
import { Author } from '../auth/auth.decorator';
import { GetUserDto } from '../users/users.dto';
import {
  MessageDto,
  CreateMessageDto,
  MessageListResponseDto,
  MessageListRequestDto,
  EditMessageDto,
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

  @Post()
  @ApiOkResponse({
    type: MessageDto,
    description: 'Create message',
  })
  async create(@Author() author: GetUserDto, @Body() body: CreateMessageDto) {
    const message = await this.textRoomsService.create(author, body);
    return message;
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
