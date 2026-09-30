import { Module } from '@nestjs/common';
import { EntitySyncGateway } from './entity-sync.gateway';

@Module({
  providers: [EntitySyncGateway],
})
export class EntitySyncModule {}
