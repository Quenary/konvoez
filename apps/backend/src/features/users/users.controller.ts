import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { GetUserDto } from './users.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRefreshFallback } from '../auth/auth.decorator';
import { UsersAvatarsService } from './users-avatars.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersAvatarsService: UsersAvatarsService,
  ) {}

  @Get()
  @ApiOkResponse({
    type: GetUserDto,
    isArray: true,
    description: 'Get all users',
  })
  async findAll(): Promise<GetUserDto[]> {
    return await this.usersService.findAllAsDto();
  }

  @Get('avatar/stream')
  @AuthRefreshFallback(true)
  @ApiOkResponse({
    type: StreamableFile,
    description: 'Returns avatar binary stream directly',
  })
  async getAvatar(
    @Query('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, contentType, contentLength } =
      await this.usersAvatarsService.getStream(key);
    res.set({
      'Content-Type': contentType,
      ...(contentLength && { 'Content-Length': contentLength.toString() }),
      'Cache-Control': 'private, max-age=86400',
    });

    return new StreamableFile(stream);
  }

  @Get(':id')
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Get user by id',
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<GetUserDto> {
    return await this.usersService.findOneAsDto(id);
  }
}
