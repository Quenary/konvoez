import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { CacheModule } from '@nestjs/cache-manager';
import { SettingsModule } from '../settings/settings.module';
import { InvitesModule } from '../invites/invites.module';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PasswordRecoveryCodeEntity } from './password-recovery-code.entity';

@Global()
@Module({
  imports: [
    JwtModule,
    CacheModule.register(),
    SettingsModule,
    InvitesModule,
    MikroOrmModule.forFeature([PasswordRecoveryCodeEntity]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
