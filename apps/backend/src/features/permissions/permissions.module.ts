import { Global, Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { PermissionsFacade } from './permissions.facade';

@Global()
@Module({
  imports: [RolesModule],
  providers: [PermissionsFacade],
  exports: [PermissionsFacade],
})
export class PermissionsModule {}
