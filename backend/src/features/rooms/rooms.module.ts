import { Global, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RoomEntity } from './rooms.entity';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';

@Global()
@Module({
  imports: [MikroOrmModule.forFeature([RoomEntity])],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
