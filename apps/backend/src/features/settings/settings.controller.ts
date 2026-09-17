import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SettingsService } from './settings.service';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import {
  IceServersSettingDto,
  InviteOnlySignUpSettingDto,
  SettingsUpdateDto,
} from './settings.dto';
import { AuthGuardRoles } from '../auth/auth.decorator';
import {
  ESettingKey,
  EUserRole,
  TSetting,
  TSettingByKey,
} from '@konvoez/shared';

@Controller('settings')
@UseGuards(AuthGuard)
@ApiExtraModels(IceServersSettingDto, InviteOnlySignUpSettingDto)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('list')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: getSchemaPath(IceServersSettingDto) },
          { $ref: getSchemaPath(InviteOnlySignUpSettingDto) },
        ],
      },
    },
    description: 'Get all settings',
  })
  async getAll(): Promise<TSetting[]> {
    return await this.settingsService.findAllAsDto();
  }

  @Get(':key')
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(IceServersSettingDto) },
        { $ref: getSchemaPath(InviteOnlySignUpSettingDto) },
      ],
    },
    description: 'Get setting by key',
  })
  async getOne<K extends ESettingKey>(
    @Param('key') key: K,
  ): Promise<TSettingByKey<K>> {
    return await this.settingsService.findOneAsDto(key);
  }

  @Put()
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: getSchemaPath(IceServersSettingDto) },
          { $ref: getSchemaPath(InviteOnlySignUpSettingDto) },
        ],
      },
    },
    description: 'Update settings',
  })
  @AuthGuardRoles([EUserRole.ADMIN, EUserRole.OWNER])
  async update(@Body() dtos: SettingsUpdateDto): Promise<TSetting[]> {
    return await this.settingsService.updateManyAsDto(dtos);
  }
}
