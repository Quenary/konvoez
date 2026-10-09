import { Module } from '@nestjs/common';
import { TextRoomsGateway } from './text-rooms.gateway';
import { TextRoomsService } from './text-rooms.service';
import { TextRoomsController } from './text-rooms.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  MessageEntity,
  MessageReadEntity,
  MessageReactionEntity,
  MessageSearchTokenEntity,
} from './text-rooms.entity';
import { AttachmentsModule } from '../attachments/attachments.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      MessageEntity,
      MessageReadEntity,
      MessageReactionEntity,
      MessageSearchTokenEntity,
    ]),
    AttachmentsModule,
    SettingsModule,
  ],
  controllers: [TextRoomsController],
  providers: [TextRoomsGateway, TextRoomsService],
})
export class TextRoomsModule {}
