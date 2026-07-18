import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AvatarsService } from './avatars.service';
import { UsersService } from '../users/users.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Author } from '../auth/auth.decorator';
import { UserEntity } from '../users/users.entity';
import { ApiOkResponse } from '@nestjs/swagger';

@Controller('avatars')
@UseGuards(AuthGuard)
export class AvatarsController {
  @Inject(AvatarsService)
  private readonly avatarsService!: AvatarsService;
  @Inject(UsersService)
  private readonly usersService!: UsersService;

  @Post('upload')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOkResponse({
    type: String,
    description: 'Returns avatar key',
  })
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Author() author: UserEntity,
  ) {
    const avatar = await this.avatarsService.uploadAvatar(file, author.id);
    await this.usersService.update(author.id, { avatar }, author);
    return avatar;
  }

  @Get('url')
  @ApiOkResponse({
    type: String,
    description: 'Get avatar signed url',
  })
  async getUrl(@Query('key') key: string) {
    return await this.avatarsService.getAvatarUrl(key);
  }

  @Get('url/:userId')
  @ApiOkResponse({
    type: String,
    description: 'Get avatar signed url by user id',
  })
  async getUrlByUserId(@Param('userId') userId: number) {
    const user = await this.usersService.findOne(userId);
    if (!user.avatar) {
      throw new NotFoundException('User has no avatar');
    }
    return await this.avatarsService.getAvatarUrl(user.avatar);
  }
}
