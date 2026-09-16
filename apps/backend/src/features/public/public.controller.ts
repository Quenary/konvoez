import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import { ESettingKey } from '@konvoez/shared';
import { PublicSettingsDto } from './public.dto';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly authService: AuthService,
    private readonly settingsService: SettingsService,
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
}
