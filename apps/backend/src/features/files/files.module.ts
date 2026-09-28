import { Module } from '@nestjs/common';
import { OrphanFilesService } from './orphan-files.service';

@Module({
  providers: [OrphanFilesService],
})
export class FilesModule {}
