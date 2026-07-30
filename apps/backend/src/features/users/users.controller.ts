import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto, GetUserDto, UpdateUserDto } from './users.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { UserEntity } from './users.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { AvatarsService } from '../avatars/avatars.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly avatarsService: AvatarsService,
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  @ApiOkResponse({
    type: GetUserDto,
    isArray: true,
    description: 'Get all users',
  })
  async findAll() {
    return await this.usersService.findAll();
  }

  @Post()
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Create user',
  })
  async create(@Body() dto: CreateUserDto) {
    console.log(dto);
    return await this.usersService.create(dto);
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Get user by id',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.usersService.findOne(id);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Update user by id',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Author() author: UserEntity,
  ) {
    return await this.usersService.update(id, dto, author);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  @ApiOkResponse({
    description: 'Delete user by id',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Author() author: UserEntity,
  ) {
    return await this.usersService.remove(id, author);
  }

  @UseGuards(AuthGuard)
  @Post('avatar/upload')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOkResponse({
    type: String,
    description: 'Upload avatar and get its key (no user data mutation)',
  })
  async avatarUpload(@UploadedFile() file: Express.Multer.File) {
    const avatar = await this.avatarsService.uploadAvatar(file);
    return avatar;
  }

  @UseGuards(AuthGuard)
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
      await this.avatarsService.getAvatarStream(key);
    res.set({
      'Content-Type': contentType,
      ...(contentLength && { 'Content-Length': contentLength.toString() }),
      'Cache-Control': 'public, max-age=86400',
    });

    return new StreamableFile(stream);
  }
}
