import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RoleEntitySchema } from './roles.entity';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
@Module({
  imports: [MikroOrmModule.forFeature([RoleEntitySchema])],
  providers: [RolesService],
  controllers: [RolesController],
  exports: [RolesService],
})
export class RolesModule {}
