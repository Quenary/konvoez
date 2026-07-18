import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RoomsModule } from './features/rooms/rooms.module';
import { UsersModule } from './features/users/users.module';
import { AuthModule } from './features/auth/auth.module';
import { SharedModule } from './shared/shared.module';
import { VoiceRoomsModule } from './features/voice-rooms/voice-rooms.module';
import { TextRoomsModule } from './features/text-rooms/text-rooms.module';
import { AvatarsModule } from './features/avatars/avatars.module';
import { SettingsModule } from './features/settings/settings.module';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { KonvoezBaseEntity } from '@shared/types/base.entity';
import { RoomEntity } from './features/rooms/rooms.entity';
import { SettingsEntity } from './features/settings/settings.entity';
import { MessageEntity } from './features/text-rooms/text-rooms.entity';
import { UserEntity } from './features/users/users.entity';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      dbName: 'sqlite.db',
      entities: [UserEntity, RoomEntity, SettingsEntity, MessageEntity],
      driver: SqliteDriver,
    }),
    VoiceRoomsModule,
    AuthModule,
    RoomsModule,
    UsersModule,
    SharedModule,
    TextRoomsModule,
    AvatarsModule,
    SettingsModule,
  ],
})
export class AppModule {}
