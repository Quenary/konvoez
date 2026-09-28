import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule, CacheModule.register()],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
