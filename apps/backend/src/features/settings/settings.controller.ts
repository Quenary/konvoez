import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SettingsService } from './settings.service';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import {
  AttachmentsEnabledSettingDto,
  AttachmentsMaxFileSizeSettingDto,
  AttachmentsMaxFilesPerMessageSettingDto,
  AttachmentsStripImageMetadataSettingDto,
  IceServersSettingDto,
  InviteOnlySignUpSettingDto,
  PasswordRecoveryCodeTtlSettingDto,
  SettingsUpdateDto,
} from './settings.dto';
import { AuthGuardRoles } from '../auth/auth.decorator';
import {
  ESettingKey,
  EUserRole,
  TSetting,
  TSettingByKey,
} from '@konvoez/shared';

const settingResponseModels = [
  { $ref: getSchemaPath(IceServersSettingDto) },
  { $ref: getSchemaPath(InviteOnlySignUpSettingDto) },
  { $ref: getSchemaPath(PasswordRecoveryCodeTtlSettingDto) },
  { $ref: getSchemaPath(AttachmentsEnabledSettingDto) },
  { $ref: getSchemaPath(AttachmentsMaxFileSizeSettingDto) },
  { $ref: getSchemaPath(AttachmentsMaxFilesPerMessageSettingDto) },
  { $ref: getSchemaPath(AttachmentsStripImageMetadataSettingDto) },
] as const;

@Controller('settings')
@UseGuards(AuthGuard)
@ApiExtraModels(
  IceServersSettingDto,
  InviteOnlySignUpSettingDto,
  PasswordRecoveryCodeTtlSettingDto,
  AttachmentsEnabledSettingDto,
  AttachmentsMaxFileSizeSettingDto,
  AttachmentsMaxFilesPerMessageSettingDto,
  AttachmentsStripImageMetadataSettingDto,
)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('list')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        oneOf: [...settingResponseModels],
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
      oneOf: [...settingResponseModels],
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
        oneOf: [...settingResponseModels],
      },
    },
    description: 'Update settings',
  })
  @AuthGuardRoles([EUserRole.ADMIN, EUserRole.OWNER])
  async update(@Body() dtos: SettingsUpdateDto): Promise<TSetting[]> {
    return await this.settingsService.updateManyAsDto(dtos);
  }
}
