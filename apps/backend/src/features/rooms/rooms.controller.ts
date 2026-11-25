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
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RoomsService } from './rooms.service';
import { VoiceRoomGrantsService } from '../voice-rooms/voice-room-grants.service';
import {
  CreateRoomDto,
  GetRoomDto,
  ReorderRoomsDto,
  RoomAvatarQueryDto,
  UpdateRoomDto,
} from './rooms.dto';
import { AuthGuard } from '../auth/auth.guard';
import {
  AuthRefreshFallback,
  AuthSessionOnly,
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
import { etagMatches } from '@shared/utils/http-etag.util';

@Controller('rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsAvatarsService: RoomsAvatarsService,
    private readonly voiceRoomGrantsService: VoiceRoomGrantsService,
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
    return this.roomsService.findAllAsSafeDto(
      author,
      this.voiceRoomGrantsService.getUserActiveGuestRooms(author.id),
    );
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
  @AuthSessionOnly(true)
  @ApiOkResponse({
    type: StreamableFile,
    description: 'Returns avatar binary stream directly',
  })
  async getAvatar(
    @Query() query: RoomAvatarQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    const etag = `"${query.key}"`;
    res.set({
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    });
    if (etagMatches(req.header('if-none-match'), etag)) {
      res.status(304);
      return undefined;
    }

    const { stream, contentType, contentLength } =
      await this.roomsAvatarsService.getStream(query.key);
    res.set({
      'Content-Type': contentType,
      ...(contentLength !== undefined && {
        'Content-Length': contentLength.toString(),
      }),
    });
    res.on('close', () => stream.destroy());

    return new StreamableFile(stream);
  }

  @Put('reorder')
  @RequirePermissions([EPermission.MANAGE_ROOMS])
  @ApiOkResponse({ type: GetRoomDto, isArray: true })
  async reorder(@Body() dto: ReorderRoomsDto): Promise<GetRoomDto[]> {
    const rooms = await this.roomsService.reorder(dto);
    return rooms.map((room) => this.roomsService.toDto(room));
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
