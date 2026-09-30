import { Module } from '@nestjs/common';
import { VoiceRoomsGateway } from './voice-rooms.gateway';
import { VoiceRoomsStateService } from './voice-rooms.state';
import { DirectCallsStateService } from './direct-calls.state';

@Module({
  providers: [
    VoiceRoomsGateway,
    VoiceRoomsStateService,
    DirectCallsStateService,
  ],
})
export class VoiceRoomsModule {}
