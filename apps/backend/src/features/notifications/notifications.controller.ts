import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { GetUserSafeDto } from '../users/users.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  PushSubscriptionDto,
  PushSubscriptionEndpointDto,
  UpdateUserNotificationSettingsDto,
  UserNotificationSettingsDto,
  VapidPublicKeyDto,
} from './notifications.dto';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('vapid-public-key')
  @ApiOkResponse({
    type: VapidPublicKeyDto,
    description: 'Get VAPID public key',
  })
  async getVapidPublicKey(): Promise<VapidPublicKeyDto> {
    return {
      publicKey: await this.notificationsService.getPublicKeyIfEnabled(),
    };
  }

  @Get('settings')
  @ApiOkResponse({
    type: UserNotificationSettingsDto,
    description: 'Get user notification settings',
  })
  async getSettings(
    @Author() author: GetUserSafeDto,
  ): Promise<UserNotificationSettingsDto> {
    return this.notificationsService.getUserNotificationSettings(author.id);
  }

  @Patch('settings')
  @ApiOkResponse({
    type: UserNotificationSettingsDto,
    description: 'Update user notification settings',
  })
  async updateSettings(
    @Author() author: GetUserSafeDto,
    @Body() body: UpdateUserNotificationSettingsDto,
  ): Promise<UserNotificationSettingsDto> {
    return this.notificationsService.updateUserNotificationSettings(
      author,
      body,
    );
  }

  @Post('subscription')
  @ApiOkResponse({ description: 'Create or update push subscription' })
  async upsertSubscription(
    @Author() author: GetUserSafeDto,
    @Body() body: PushSubscriptionDto,
  ): Promise<void> {
    await this.notificationsService.saveSubscription(author, body);
  }

  @Post('subscription/unsubscribe')
  @ApiOkResponse({ description: 'Delete push subscription' })
  async unsubscribe(
    @Author() author: GetUserSafeDto,
    @Body() body: PushSubscriptionEndpointDto,
  ): Promise<void> {
    await this.notificationsService.removeSubscription(author, body.endpoint);
  }
}
