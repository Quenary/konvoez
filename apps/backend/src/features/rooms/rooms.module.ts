import { Global, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RoomEntity } from './rooms.entity';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RoomsAvatarsService } from './rooms-avatars.service';

@Global()
@Module({
  imports: [MikroOrmModule.forFeature([RoomEntity])],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsAvatarsService],
  exports: [RoomsService],
})
export class RoomsModule {}
