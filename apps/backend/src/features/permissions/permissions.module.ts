import { Global, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RoleEntitySchema } from '../roles/roles.entity';
import { PermissionsService } from './permissions.service';

@Global()
@Module({
  imports: [MikroOrmModule.forFeature([RoleEntitySchema])],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
