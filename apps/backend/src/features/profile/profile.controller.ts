import {
  Body,
  Controller,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { GetUserDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { UsersAvatarsService } from '../users/users-avatars.service';
import { UploadFileResultDto } from '@shared/types/upload-file.dto';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './profile.dto';

@ApiTags('profile')
@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly usersService: UsersService,
    private readonly usersAvatarsService: UsersAvatarsService,
  ) {}

  @Patch()
  @ApiOkResponse({
    type: GetUserDto,
    description: 'Update the current user profile',
  })
  async update(
    @Body() dto: UpdateProfileDto,
    @Author() author: GetUserDto,
  ): Promise<GetUserDto> {
    return await this.profileService.updateSelf(author, dto);
  }

  @Post('avatar/upload')
  @UseInterceptors(FileInterceptor('avatar'))
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
}
