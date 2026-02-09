import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, GetUserDto, UpdateUserDto } from './users.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { UserEntity } from './users.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
