import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  ParseIntPipe,
  UseGuards,
  Put,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, GetRoomDto, UpdateRoomDto } from './rooms.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { UserEntity } from '../users/users.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoomsAvatarsService } from './rooms-avatars.service';
import { UploadFileResultDto } from '@shared/types/upload-file.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { GetUserDto } from '../users/users.dto';

@Controller('rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsAvatarsService: RoomsAvatarsService,
  ) {}

  @Post()
  @ApiOkResponse({ type: GetRoomDto })
  async create(
    @Body() dto: CreateRoomDto,
    @Author() author: GetUserDto,
  ): Promise<GetRoomDto> {
    const room = await this.roomsService.create(dto, author);
    return this.roomsService.toDto(room);
  }

  @Get()
  @ApiOkResponse({ type: GetRoomDto, isArray: true })
  findAll(): Promise<GetRoomDto[]> {
    return this.roomsService.findAllAsDto();
  }

  @Post('avatar/upload')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOkResponse({
    type: UploadFileResultDto,
    description: 'Upload avatar and get its key (no room data mutation)',
  })
  async avatarUpload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadFileResultDto> {
    const key = await this.roomsAvatarsService.upload(file);
    return {
      key,
      url: this.roomsService.getAvatarUrl(key) as string,
    };
  }

  @Get('avatar/stream')
  @ApiOkResponse({
    type: StreamableFile,
    description: 'Returns avatar binary stream directly',
  })
  async getAvatar(
    @Query('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, contentType, contentLength } =
      await this.roomsAvatarsService.getStream(key);
    res.set({
      'Content-Type': contentType,
      ...(contentLength && { 'Content-Length': contentLength.toString() }),
      'Cache-Control': 'public, max-age=86400',
    });

    return new StreamableFile(stream);
  }

  @Get(':id')
  @ApiOkResponse({ type: GetRoomDto })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<GetRoomDto> {
    return this.roomsService.findOneAsDto(id);
  }

  @Put(':id')
  @ApiOkResponse({ type: GetRoomDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoomDto,
    @Author() author: UserEntity,
  ): Promise<GetRoomDto> {
    const room = await this.roomsService.update(id, dto, author);
    return this.roomsService.toDto(room);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Author() author: UserEntity,
  ) {
    return this.roomsService.remove(id, author);
  }
}
