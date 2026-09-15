import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { RoomsModule } from './features/rooms/rooms.module';
import { UsersModule } from './features/users/users.module';
import { AuthModule } from './features/auth/auth.module';
import { SharedModule } from './shared/shared.module';
import { VoiceRoomsModule } from './features/voice-rooms/voice-rooms.module';
import { TextRoomsModule } from './features/text-rooms/text-rooms.module';
import { SettingsModule } from './features/settings/settings.module';
import { PublicModule } from './features/public/public.module';
import { createMikroOrmConfig } from './mikro-orm.config';

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      useFactory: createMikroOrmConfig,
    }),
    VoiceRoomsModule,
    AuthModule,
    RoomsModule,
    UsersModule,
    SharedModule,
    TextRoomsModule,
    SettingsModule,
    PublicModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
