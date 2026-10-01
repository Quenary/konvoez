import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { SettingsModule } from '../settings/settings.module';
import { InvitesModule } from '../invites/invites.module';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PasswordRecoveryCodeEntity } from './password-recovery-code.entity';
import { UserEntity } from '../users/users.entity';

@Global()
@Module({
  imports: [
    JwtModule,
    SettingsModule,
    InvitesModule,
    MikroOrmModule.forFeature([PasswordRecoveryCodeEntity, UserEntity]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
