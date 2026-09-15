import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SettingsService } from './settings.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { SettingsDto, SettingsUpdateDto } from './settings.dto';
import { AuthGuardRoles } from '../auth/auth.decorator';
import { ESettingKey, EUserRole } from '@konvoez/shared';

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
  async getAll(): Promise<SettingsDto[]> {
    return await this.settingsService.findAllAsDto();
  }

  @Get(':key')
  @ApiOkResponse({
    type: SettingsDto,
    description: 'Get setting by key',
  })
  async getOne(@Param('key') key: ESettingKey): Promise<SettingsDto> {
    return await this.settingsService.findOneAsDto(key);
  }

  @Put(':key')
  @ApiOkResponse({
    type: SettingsDto,
    description: 'Update setting',
  })
  @AuthGuardRoles([EUserRole.ADMIN, EUserRole.OWNER])
  async update(
    @Param('key') key: ESettingKey,
    @Body() dto: SettingsUpdateDto,
  ): Promise<SettingsDto> {
    return await this.settingsService.updateAsDto(key, dto);
  }
}
