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
import { EUserRole } from '@konvoez/shared';
import { AuthGuard } from '../auth/auth.guard';
import { AuthGuardRoles, Author } from '../auth/auth.decorator';
import { InvitesService } from './invites.service';
import { InviteCreateDto, InviteDto } from './invites.dto';
import type { GetUserDto } from '../users/users.dto';

@ApiTags('invites')
@Controller('invites')
@UseGuards(AuthGuard)
@AuthGuardRoles([EUserRole.ADMIN, EUserRole.OWNER])
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Get()
  @ApiOkResponse({
    type: InviteDto,
    isArray: true,
    description: 'Get all invites',
  })
  async getAll(): Promise<InviteDto[]> {
    return await this.invitesService.findAll();
  }

  @Post()
  @ApiOkResponse({
    type: InviteDto,
    description: 'Create a new invite',
  })
  async create(
    @Body() dto: InviteCreateDto,
    @Author() author: GetUserDto,
  ): Promise<InviteDto> {
    return await this.invitesService.create(dto, author);
  }

  @Patch(':id/revoke')
  @ApiOkResponse({
    type: InviteDto,
    description: 'Revoke an active invite',
  })
  async revoke(@Param('id', ParseIntPipe) id: number): Promise<InviteDto> {
    return await this.invitesService.revoke(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Delete invite physically',
  })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.invitesService.delete(id);
  }
}
