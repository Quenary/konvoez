import { Global, Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { PasswordService } from './services/password.service';

@Global()
@Module({
  providers: [ConfigService, PasswordService],
  exports: [ConfigService, PasswordService],
})
export class SharedModule {}
