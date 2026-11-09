import { Module } from '@nestjs/common';
import { VoiceRoomGrantsService } from './voice-room-grants.service';

@Module({
  providers: [VoiceRoomGrantsService],
  exports: [VoiceRoomGrantsService],
})
export class VoiceRoomGrantsModule {}
