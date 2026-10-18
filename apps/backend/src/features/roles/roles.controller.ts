import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EPermission } from '@konvoez/shared';
import { AuthGuard } from '../auth/auth.guard';
import { Author, RequirePermissions } from '../auth/auth.decorator';
import { GetUserDto } from '../users/users.dto';
import { PermissionsFacade } from '../permissions/permissions.facade';
import { RolesService } from './roles.service';
import { CreateRoleDto, RoleDto, UpdateRoleDto } from './roles.dto';

@ApiTags('roles')
@Controller('roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly permissionsFacade: PermissionsFacade,
  ) {}

  @Get()
  @ApiOkResponse({ type: RoleDto, isArray: true })
  async findAll(): Promise<RoleDto[]> {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: RoleDto })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<RoleDto> {
    return this.rolesService.findOneAsDto(id);
  }

  @Post()
  @RequirePermissions([EPermission.MANAGE_ROLES])
  @ApiOkResponse({ type: RoleDto })
  async create(
    @Author() author: GetUserDto,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleDto> {
    this.permissionsFacade.assertCanManageRole(author, dto.priority ?? 0);
    if (dto.permissions && dto.permissions.length > 0) {
      await this.permissionsFacade.assertCanGrantPermissions(
        author,
        dto.permissions,
      );
    }
    return this.rolesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions([EPermission.MANAGE_ROLES])
  @ApiOkResponse({ type: RoleDto })
  async update(
    @Author() author: GetUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleDto> {
    const existingRole = await this.rolesService.findOne(id);
    this.permissionsFacade.assertCanManageRole(author, existingRole.priority);
    if (dto.priority !== undefined) {
      this.permissionsFacade.assertCanManageRole(author, dto.priority);
    }
    if (dto.permissions !== undefined && dto.permissions.length > 0) {
      await this.permissionsFacade.assertCanGrantPermissions(
        author,
        dto.permissions,
      );
    }
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions([EPermission.MANAGE_ROLES])
  @ApiNoContentResponse()
  async remove(
    @Author() author: GetUserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const existingRole = await this.rolesService.findOne(id);
    this.permissionsFacade.assertCanManageRole(author, existingRole.priority);
    await this.rolesService.remove(id);
  }
}
