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
import { RequirePermissions } from '../auth/auth.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto, RoleDto, UpdateRoleDto } from './roles.dto';

@ApiTags('roles')
@Controller('roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

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
  async create(@Body() dto: CreateRoleDto): Promise<RoleDto> {
    return this.rolesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions([EPermission.MANAGE_ROLES])
  @ApiOkResponse({ type: RoleDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleDto> {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions([EPermission.MANAGE_ROLES])
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.rolesService.remove(id);
  }
}
