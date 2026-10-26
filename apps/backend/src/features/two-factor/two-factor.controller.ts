import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { GetUserSafeDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { AuthService } from '../auth/auth.service';
import { TwoFactorService } from './two-factor.service';
import {
  TwoFactorConfirmDto,
  TwoFactorEnableDto,
  TwoFactorRecoveryCodesResponseDto,
  TwoFactorSetupDto,
  TwoFactorSetupResponseDto,
} from './two-factor.dto';

@ApiTags('profile')
@Controller('profile/2fa')
@UseGuards(AuthGuard)
export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Post('setup')
  @ApiOkResponse({
    type: TwoFactorSetupResponseDto,
    description: 'Begin TOTP two-factor enrollment',
  })
  async setup(
    @Body() dto: TwoFactorSetupDto,
    @Author() author: GetUserSafeDto,
  ): Promise<TwoFactorSetupResponseDto> {
    const user = await this.usersService.findOne(author.id);
    return await this.twoFactorService.beginSetup(user, dto.password);
  }

  @Post('enable')
  @ApiOkResponse({
    type: TwoFactorRecoveryCodesResponseDto,
    description: 'Confirm TOTP enrollment and generate initial recovery codes',
  })
  async enable(
    @Body() dto: TwoFactorEnableDto,
    @Author() author: GetUserSafeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TwoFactorRecoveryCodesResponseDto> {
    const user = await this.usersService.findOne(author.id);
    const { recoveryCodes, sessionVersion } =
      await this.twoFactorService.confirmSetup(user, dto.code);

    this.authService.setAuthCookies(author.id, sessionVersion, res);
    return { recoveryCodes };
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Disable two-factor authentication',
  })
  async disable(
    @Body() dto: TwoFactorConfirmDto,
    @Author() author: GetUserSafeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const user = await this.usersService.findOne(author.id);
    const sessionVersion = await this.twoFactorService.disable(
      user,
      dto.password,
      dto.code,
    );

    this.authService.setAuthCookies(author.id, sessionVersion, res);
  }

  @Post('recovery-codes')
  @ApiOkResponse({
    type: TwoFactorRecoveryCodesResponseDto,
    description: 'Regenerate two-factor recovery codes',
  })
  async regenerateRecoveryCodes(
    @Body() dto: TwoFactorConfirmDto,
    @Author() author: GetUserSafeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TwoFactorRecoveryCodesResponseDto> {
    const user = await this.usersService.findOne(author.id);
    const { recoveryCodes, sessionVersion } =
      await this.twoFactorService.regenerateRecoveryCodes(
        user,
        dto.password,
        dto.code,
      );

    this.authService.setAuthCookies(author.id, sessionVersion, res);
    return { recoveryCodes };
  }
}
