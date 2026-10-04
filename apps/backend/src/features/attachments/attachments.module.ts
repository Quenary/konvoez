import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MessageAttachmentEntity } from './attachments.entity';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentUploadInterceptor } from './attachment-upload.interceptor';
import { MimeSnifferService } from './mime-sniffer.service';
import { AttachmentsCleanupService } from './attachments-cleanup.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([MessageAttachmentEntity]),
    SettingsModule,
  ],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    AttachmentUploadInterceptor,
    MimeSnifferService,
    AttachmentsCleanupService,
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
