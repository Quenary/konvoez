import { Module } from '@nestjs/common';
import { TextRoomsGateway } from './text-rooms.gateway';
import { TextRoomsService } from './text-rooms.service';
import { TextRoomsController } from './text-rooms.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MessageEntity, MessageSearchTokenEntity } from './text-rooms.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([MessageEntity, MessageSearchTokenEntity]),
  ],
  controllers: [TextRoomsController],
  providers: [TextRoomsGateway, TextRoomsService],
})
export class TextRoomsModule {}
