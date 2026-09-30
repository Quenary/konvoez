import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserEntity } from '../users/users.entity';
import { UsersModule } from '../users/users.module';
import { UserManagementController } from './user-management.controller';
import { UserManagementService } from './user-management.service';

@Module({
  imports: [UsersModule, MikroOrmModule.forFeature([UserEntity])],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule {}
