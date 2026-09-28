import { Module } from '@nestjs/common';
import { VoiceRoomsGateway } from './voice-rooms.gateway';
import { VoiceRoomsStateService } from './voice-rooms.state';
import { DirectCallsStateService } from './direct-calls.state';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [
    VoiceRoomsGateway,
    VoiceRoomsStateService,
    DirectCallsStateService,
  ],
})
export class VoiceRoomsModule {}
