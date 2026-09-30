import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserEntity } from '../users/users.entity';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [UsersModule, MikroOrmModule.forFeature([UserEntity])],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
