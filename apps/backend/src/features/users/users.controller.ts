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
import { UsersAvatarsService } from './users-avatars.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersAvatarsService: UsersAvatarsService,
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  @ApiOkResponse({
    type: GetUserDto,
    isArray: true,
    description: 'Get all users',
  })
  async findAll(): Promise<GetUserDto[]> {
    return await this.usersService.findAllAsDto();
  }

  @Post()
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Create user',
  })
  async create(@Body() dto: CreateUserDto): Promise<GetUserDto> {
    const user = await this.usersService.create(dto);
    return this.usersService.toDto(user);
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Get user by id',
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<GetUserDto> {
    return await this.usersService.findOneAsDto(id);
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
  ): Promise<GetUserDto> {
    const user = await this.usersService.update(id, dto, author);
    return this.usersService.toDto(user);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  @ApiOkResponse({
    description: 'Delete user by id',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Author() author: UserEntity,
  ): Promise<void> {
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
    const avatar = await this.usersAvatarsService.upload(file);
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
      await this.usersAvatarsService.getStream(key);
    res.set({
      'Content-Type': contentType,
      ...(contentLength && { 'Content-Length': contentLength.toString() }),
      'Cache-Control': 'public, max-age=86400',
    });

    return new StreamableFile(stream);
  }
}
