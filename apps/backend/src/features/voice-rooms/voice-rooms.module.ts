import { Module } from '@nestjs/common';
import { VoiceRoomsGateway } from './voice-rooms.gateway';
import { VoiceRoomsStateService } from './voice-rooms.state';

@Module({
  providers: [VoiceRoomsGateway, VoiceRoomsStateService],
})
export class VoiceRoomsModule {}
