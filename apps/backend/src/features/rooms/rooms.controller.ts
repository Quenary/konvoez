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
import {
  AuthRefreshFallback,
  Author,
  RequirePermissions,
} from '../auth/auth.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { avatarUploadLimits } from '@shared/services/file.service';
import { RoomsAvatarsService } from './rooms-avatars.service';
import { UploadFileResultDto } from '@shared/types/upload-file.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { GetUserSafeDto } from '../users/users.dto';
import { EPermission } from '@konvoez/shared';

@Controller('rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsAvatarsService: RoomsAvatarsService,
  ) {}

  @Post()
  @RequirePermissions([EPermission.MANAGE_ROOMS])
  @ApiOkResponse({ type: GetRoomDto })
  async create(
    @Body() dto: CreateRoomDto,
    @Author() author: GetUserSafeDto,
  ): Promise<GetRoomDto> {
    const room = await this.roomsService.create(dto, author);
    return this.roomsService.toDto(room);
  }

  @Get()
  @ApiOkResponse({ type: GetRoomDto, isArray: true })
  findAll(@Author() author: GetUserSafeDto): Promise<GetRoomDto[]> {
    return this.roomsService.findAllAsSafeDto(author);
  }

  @Post('avatar/upload')
  @RequirePermissions([EPermission.MANAGE_ROOMS])
  @UseInterceptors(FileInterceptor('avatar', { limits: avatarUploadLimits }))
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
      await this.roomsAvatarsService.getStream(key);
    res.set({
      'Content-Type': contentType,
      ...(contentLength && { 'Content-Length': contentLength.toString() }),
      'Cache-Control': 'private, max-age=86400',
    });

    return new StreamableFile(stream);
  }

  @Get(':id')
  @ApiOkResponse({ type: GetRoomDto })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Author() author: GetUserSafeDto,
  ): Promise<GetRoomDto> {
    return this.roomsService.findOneAsSafeDto(id, author);
  }

  @Put(':id')
  @RequirePermissions([EPermission.MANAGE_ROOMS])
  @ApiOkResponse({ type: GetRoomDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoomDto,
  ): Promise<GetRoomDto> {
    const room = await this.roomsService.update(id, dto);
    return this.roomsService.toDto(room);
  }

  @Delete(':id')
  @RequirePermissions([EPermission.MANAGE_ROOMS])
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.remove(id);
  }
}
