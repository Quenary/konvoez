import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import { Author } from '../auth/auth.decorator';
import { GetUserDto } from '../users/users.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  PushSubscriptionDto,
  PushSubscriptionEndpointDto,
  VapidPublicKeyDto,
} from './notifications.dto';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('vapid-public-key')
  @ApiOkResponse({ type: VapidPublicKeyDto, description: 'Get VAPID public key' })
  async getVapidPublicKey(): Promise<VapidPublicKeyDto> {
    return {
      publicKey: this.notificationsService.getPublicKey(),
    };
  }

  @Post('subscription')
  @ApiOkResponse({ description: 'Create or update push subscription' })
  async upsertSubscription(
    @Author() author: GetUserDto,
    @Body() body: PushSubscriptionDto,
  ): Promise<void> {
    await this.notificationsService.saveSubscription(author, body);
  }

  @Post('subscription/unsubscribe')
  @ApiOkResponse({ description: 'Delete push subscription' })
  async unsubscribe(
    @Author() author: GetUserDto,
    @Body() body: PushSubscriptionEndpointDto,
  ): Promise<void> {
    await this.notificationsService.removeSubscription(author, body.endpoint);
  }
}
