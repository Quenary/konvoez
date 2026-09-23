import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionEntity } from './notifications.entity';
import { VapidKeyStorageService } from './vapid-key-storage.service';

@Module({
  imports: [MikroOrmModule.forFeature([PushSubscriptionEntity])],
  controllers: [NotificationsController],
  providers: [NotificationsService, VapidKeyStorageService],
  exports: [NotificationsService, VapidKeyStorageService],
})
export class NotificationsModule {}
