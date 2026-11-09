import { Module } from '@nestjs/common';
import { EntitySyncGateway } from './entity-sync.gateway';
import { VoiceRoomGrantsModule } from '../voice-rooms/voice-room-grants.module';

@Module({
  imports: [VoiceRoomGrantsModule],
  providers: [EntitySyncGateway],
})
export class EntitySyncModule {}
