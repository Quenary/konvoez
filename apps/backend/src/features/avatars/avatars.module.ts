import { Global, Module } from '@nestjs/common';
import { AvatarsService } from './avatars.service';

@Global()
@Module({
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
