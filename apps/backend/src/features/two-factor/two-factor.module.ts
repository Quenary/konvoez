import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UsersModule } from '../users/users.module';
import { TwoFactorRecoveryCodeEntity } from './two-factor-recovery-code.entity';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    UsersModule,
    MikroOrmModule.forFeature([TwoFactorRecoveryCodeEntity]),
  ],
  controllers: [TwoFactorController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
