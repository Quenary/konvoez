import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SettingsService } from './settings.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { SettingsDto, SettingsUpdateDto } from './settings.dto';
import { SettingsCommon } from '@konvoez/shared';
import { AuthGuardRoles } from '../auth/auth.decorator';
import { EUserRole } from '@konvoez/shared';

@Controller('settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('list')
  @ApiOkResponse({
    type: SettingsDto,
    isArray: true,
    description: 'Get all settings',
  })
  async getAll(): Promise<SettingsDto<any>[]> {
    return await this.settingsService.findAll();
  }

  @Get()
  @ApiOkResponse({
    type: SettingsDto,
    description: 'Get setting by id or key',
  })
  async getOne(
    @Query('id', new ParseIntPipe({ optional: true })) id?: number,
    @Query('key') key?: SettingsCommon.EKey,
  ): Promise<SettingsDto<any>> {
    return await this.settingsService.findOne({ id, key });
  }

  @Put(':id')
  @ApiOkResponse({
    type: SettingsDto,
    description: 'Update setting',
  })
  @AuthGuardRoles([EUserRole.ADMIN, EUserRole.OWNER])
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SettingsUpdateDto<any>,
  ): Promise<SettingsDto<any>> {
    return await this.settingsService.update(id, dto);
  }
}
