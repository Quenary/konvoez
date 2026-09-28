import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import { ESettingKey } from '@konvoez/shared';
import { PublicSettingsDto, PublicVersionDto } from './public.dto';
import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly authService: AuthService,
    private readonly settingsService: SettingsService,
    private readonly publicService: PublicService,
  ) {}

  @Get('health')
  @ApiOkResponse({
    description: 'Health check',
    schema: { example: { status: 'ok' } },
  })
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('settings')
  @ApiOkResponse({
    type: PublicSettingsDto,
    description:
      'Get public settings (owner setup required & invite-only mode)',
  })
  async getSettings(): Promise<PublicSettingsDto> {
    const isOwnerSetupRequired = await this.authService.isOwnerSetupRequired();
    const inviteOnlySignUp = await this.settingsService.getValue(
      ESettingKey.INVITE_ONLY_SIGN_UP,
    );
    return {
      isOwnerSetupRequired,
      inviteOnlySignUp,
    };
  }

  @Get('version')
  @ApiOkResponse({
    type: PublicVersionDto,
    description: 'Get current app version and available update info',
  })
  async getVersion(): Promise<PublicVersionDto> {
    return this.publicService.getVersion();
  }
}
