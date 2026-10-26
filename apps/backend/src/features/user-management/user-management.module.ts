import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';

@Module({
  imports: [UsersModule, TwoFactorModule],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule {}
