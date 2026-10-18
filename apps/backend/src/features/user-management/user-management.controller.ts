import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EPermission } from '@konvoez/shared';
import { AuthGuard } from '../auth/auth.guard';
import { Author, RequirePermissions } from '../auth/auth.decorator';
import { GetUserDto } from '../users/users.dto';
import { UserManagementService } from './user-management.service';
import { UserManagementUpdateDto } from './user-management.dto';

@ApiTags('user-management')
@Controller('user-management')
@UseGuards(AuthGuard)
export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  @Get()
  @RequirePermissions([EPermission.MANAGE_USERS])
  @ApiOkResponse({
    type: GetUserDto,
    isArray: true,
    description: 'List users for owner management',
  })
  async findAll(): Promise<GetUserDto[]> {
    return await this.userManagementService.findAll();
  }

  @Get(':id')
  @RequirePermissions([EPermission.MANAGE_USERS])
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Get a user for owner management',
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<GetUserDto> {
    return await this.userManagementService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions([EPermission.MANAGE_ROLES])
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Update a managed user (role only)',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UserManagementUpdateDto,
    @Author() author: GetUserDto,
  ): Promise<GetUserDto> {
    return await this.userManagementService.updateRole(id, dto, author);
  }

  @Post(':id/anonymize')
  @RequirePermissions([EPermission.MANAGE_USERS])
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Anonymize a user and keep their rooms and messages',
  })
  async anonymize(
    @Param('id', ParseIntPipe) id: number,
    @Author() author: GetUserDto,
  ): Promise<GetUserDto> {
    return await this.userManagementService.anonymize(id, author);
  }

  @Delete(':id')
  @RequirePermissions([EPermission.MANAGE_USERS])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Physically delete a user and their traces',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Author() author: GetUserDto,
  ): Promise<void> {
    await this.userManagementService.removePhysically(id, author);
  }
}
