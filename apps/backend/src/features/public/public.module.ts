import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [PublicController],
})
export class PublicModule {}
