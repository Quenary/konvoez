import { Module } from '@nestjs/common';
import { SignalingGateway } from './gateways/signaling.gateway';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { RoomsModule } from './features/rooms/rooms.module';
import { UsersModule } from './features/users/users.module';
import { AuthModule } from './features/auth/auth.module';
import { ConfigService } from './shared/services/config.service';
import { PasswordService } from './shared/services/password.service';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    SignalingGateway,
    MikroOrmModule.forRoot({
      entities: ['./**/*.entity.js'],
      entitiesTs: ['./**/*.entity.ts'],
      dbName: 'sqlite.db',
      driver: SqliteDriver,
    }),
    AuthModule,
    RoomsModule,
    UsersModule,
    SharedModule,
  ],
})
export class AppModule {}
