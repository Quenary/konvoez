import { Module } from '@nestjs/common';
import { VoiceRoomsGateway } from './voice-rooms.gateway';
import { VoiceRoomsStateService } from './voice-rooms.state';
import { DirectCallsStateService } from './direct-calls.state';
import { VoiceRoomGrantsModule } from './voice-room-grants.module';

@Module({
  imports: [VoiceRoomGrantsModule],
  providers: [
    VoiceRoomsGateway,
    VoiceRoomsStateService,
    DirectCallsStateService,
  ],
  exports: [VoiceRoomsStateService],
})
export class VoiceRoomsModule {}
