import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, UpdateRoomDto } from './rooms.dto';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { Author } from '../auth/auth.decorator';
import { UserEntity } from '../users/users.entity';

@Controller('rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async create(@Body() dto: CreateRoomDto, @Author() author: UserEntity) {
    return this.roomsService.create(dto, author);
  }

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoomDto,
    @Author() author: UserEntity,
  ) {
    return this.roomsService.update(id, dto, author);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Author() author: UserEntity,
  ) {
    return this.roomsService.remove(id, author);
  }
}
