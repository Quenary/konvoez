import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Global, Module } from '@nestjs/common';
import { UserEntity } from './users.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersAvatarsService } from './users-avatars.service';

@Global()
@Module({
  imports: [MikroOrmModule.forFeature([UserEntity])],
  controllers: [UsersController],
  providers: [UsersService, UsersAvatarsService],
  exports: [UsersService],
})
export class UsersModule {}
