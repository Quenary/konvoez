import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { avatarUploadLimits } from '@shared/services/file.service';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { AuthService } from '../auth/auth.service';
import { GetUserSafeDto, GetUserFullDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { UsersAvatarsService } from '../users/users-avatars.service';
import { UploadFileResultDto } from '@shared/types/upload-file.dto';
import { ProfileService } from './profile.service';
import {
  ProfileEmailChangeConfirmDto,
  ProfileEmailVerificationConfirmDto,
  UpdateProfileDto,
} from './profile.dto';

@ApiTags('profile')
@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly usersService: UsersService,
    private readonly usersAvatarsService: UsersAvatarsService,
    private readonly authService: AuthService,
  ) {}

  @Patch()
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Update the current user profile',
  })
  async update(
    @Body() dto: UpdateProfileDto,
    @Author() author: GetUserSafeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GetUserFullDto> {
    const { user, sessionVersion } = await this.profileService.updateSelf(
      author,
      dto,
    );
    if (sessionVersion !== undefined) {
      this.authService.setAuthCookies(user.id, sessionVersion, res);
    }
    return user;
  }

  @Post('anonymize')
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Anonymize the current user and keep their rooms and messages',
  })
  async anonymize(@Author() author: GetUserSafeDto): Promise<GetUserFullDto> {
    return await this.profileService.anonymizeSelf(author);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Physically delete the current user and their traces',
  })
  async remove(@Author() author: GetUserSafeDto): Promise<void> {
    await this.profileService.removeSelf(author);
  }

  @Post('avatar/upload')
  @UseInterceptors(FileInterceptor('avatar', { limits: avatarUploadLimits }))
  @ApiOkResponse({
    type: UploadFileResultDto,
    description: 'Upload avatar and get its key (no user data mutation)',
  })
  async avatarUpload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadFileResultDto> {
    const key = await this.usersAvatarsService.upload(file);
    return {
      key,
      url: this.usersService.getAvatarUrl(key) as string,
    };
  }

  @Post('email-verification/request')
  @ApiOkResponse({
    description: 'Request email verification code for current email',
  })
  async requestEmailVerification(
    @Author() author: GetUserSafeDto,
  ): Promise<{ ok: true }> {
    return await this.profileService.requestEmailVerification(author);
  }

  @Post('email-verification/confirm')
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Confirm current email verification with code',
  })
  async confirmEmailVerification(
    @Body() dto: ProfileEmailVerificationConfirmDto,
    @Author() author: GetUserSafeDto,
  ): Promise<GetUserFullDto> {
    return await this.profileService.confirmEmailVerification(author, dto.code);
  }

  @Post('email-change/confirm')
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Confirm pending email change with code',
  })
  async confirmEmailChange(
    @Body() dto: ProfileEmailChangeConfirmDto,
    @Author() author: GetUserSafeDto,
  ): Promise<GetUserFullDto> {
    return await this.profileService.confirmEmailChange(author, dto.code);
  }

  @Post('email-change/resend')
  @ApiOkResponse({
    description: 'Resend code for pending email change',
  })
  async resendEmailChange(
    @Author() author: GetUserSafeDto,
  ): Promise<{ ok: true }> {
    return await this.profileService.resendEmailChange(author);
  }

  @Post('email-change/cancel')
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Cancel pending email change',
  })
  async cancelEmailChange(
    @Author() author: GetUserSafeDto,
  ): Promise<GetUserFullDto> {
    return await this.profileService.cancelEmailChange(author);
  }
}
