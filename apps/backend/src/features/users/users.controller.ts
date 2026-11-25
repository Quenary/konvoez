import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UsersService } from './users.service';
import { GetUserSafeDto, UserAvatarQueryDto } from './users.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRefreshFallback, AuthSessionOnly } from '../auth/auth.decorator';
import { UsersAvatarsService } from './users-avatars.service';
import { etagMatches } from '@shared/utils/http-etag.util';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersAvatarsService: UsersAvatarsService,
  ) {}

  @Get()
  @ApiOkResponse({
    type: GetUserSafeDto,
    isArray: true,
    description: 'Get all users',
  })
  async findAll(): Promise<GetUserSafeDto[]> {
    return await this.usersService.findAllAsSafeDto();
  }

  @Get('avatar/stream')
  @AuthRefreshFallback(true)
  @AuthSessionOnly(true)
  @ApiOkResponse({
    type: StreamableFile,
    description: 'Returns avatar binary stream directly',
  })
  async getAvatar(
    @Query() query: UserAvatarQueryDto,
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
      await this.usersAvatarsService.getStream(query.key);
    res.set({
      'Content-Type': contentType,
      ...(contentLength !== undefined && {
        'Content-Length': contentLength.toString(),
      }),
    });
    res.on('close', () => stream.destroy());

    return new StreamableFile(stream);
  }

  @Get(':id')
  @ApiOkResponse({
    type: GetUserSafeDto,
    description: 'Get user by id',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GetUserSafeDto> {
    return await this.usersService.findOneAsSafeDto(id);
  }
}
