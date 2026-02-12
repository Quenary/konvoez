import { Module } from '@nestjs/common';
import { VoiceRoomsGateway } from './voice-rooms.gateway';
import { VoiceRoomsCacheService } from './voice-rooms-cache.service';

@Module({
  providers: [VoiceRoomsGateway, VoiceRoomsCacheService],
})
export class VoiceRoomsModule {}
