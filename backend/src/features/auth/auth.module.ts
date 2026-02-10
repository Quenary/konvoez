import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { AuthWsGuard } from './auth-ws.guard';

@Global()
@Module({
  imports: [JwtModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AuthWsGuard],
  exports: [AuthService, AuthGuard, AuthWsGuard],
})
export class AuthModule {}
