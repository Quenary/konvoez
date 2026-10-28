import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import {
  PushSubscriptionEntity,
  UserNotificationSettingsEntity,
} from './notifications.entity';
import { VapidKeyStorageService } from './vapid-key-storage.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      PushSubscriptionEntity,
      UserNotificationSettingsEntity,
    ]),
    SettingsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    VapidKeyStorageService,
    NotificationsGateway,
  ],
  exports: [NotificationsService, VapidKeyStorageService],
})
export class NotificationsModule {}
