import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRefreshFallback, Author } from '../auth/auth.decorator';
import { GetUserDto } from '../users/users.dto';
import { AttachmentUploadExceptionFilter } from '@shared/filters/attachment-upload-exception.filter';
import { AttachmentUploadInterceptor } from './attachment-upload.interceptor';
import { AttachmentsService } from './attachments.service';
import { AttachmentDto } from './attachments.dto';
import {
  attachmentEtag,
  contentDisposition,
  contentSecurityHeaders,
  etagMatches,
  inlinePolicy,
  resolveByteRange,
} from './attachments.http';
import {
  type FileService,
  FileServiceInjectionToken,
} from '@shared/services/file.service';
import { EAttachmentKind } from '@konvoez/shared';

@ApiTags('attachments')
@Controller('attachments')
@UseGuards(AuthGuard)
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
  ) {}

  @Post()
  @HttpCode(201)
  @UseFilters(AttachmentUploadExceptionFilter)
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ type: AttachmentDto })
  public upload(
    @Author() author: GetUserDto,
    @UploadedFile()
    file: { path?: string; size: number; originalname?: string } | undefined,
  ): Promise<AttachmentDto> {
    return this.attachmentsService.createPending(author, file);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Delete the caller's pending upload" })
  public async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Author() author: GetUserDto,
  ): Promise<void> {
    await this.attachmentsService.deletePending(id, author);
  }

  @Get(':id/content')
  @AuthRefreshFallback(true)
  public content(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download: string | undefined,
    @Author() author: GetUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    return this.send(id, author, false, download, req, res);
  }

  @Get(':id/thumbnail')
  @AuthRefreshFallback(true)
  public thumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @Author() author: GetUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    return this.send(id, author, true, undefined, req, res);
  }

  private async send(
    id: string,
    author: GetUserDto,
    thumbnail: boolean,
    download: string | undefined,
    req: Request,
    res: Response,
  ): Promise<StreamableFile | undefined> {
    const readable = await this.attachmentsService.resolveReadable(
      id,
      author,
      thumbnail,
    );
    const etag = attachmentEtag(id, thumbnail);
    for (const [header, value] of Object.entries(contentSecurityHeaders())) {
      res.setHeader(header, value);
    }
    res.setHeader('ETag', etag);
    if (etagMatches(req.header('if-none-match'), etag)) {
      res.status(304);
      return undefined;
    }
    const disposition = thumbnail
      ? 'inline'
      : inlinePolicy({
          kind: readable.entity.kind as EAttachmentKind,
          download,
        }).disposition;
    const contentType =
      thumbnail || disposition === 'inline'
        ? readable.mime
        : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      contentDisposition(disposition, readable.downloadName),
    );
    const { size } = await this.fileService.stat(readable.key);
    const range = resolveByteRange(req.header('range'), size);
    if (range.kind === 'unsatisfiable') {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${size}`);
      return undefined;
    }
    const fileRange =
      range.kind === 'partial'
        ? { start: range.start, end: range.end }
        : undefined;
    if (range.kind === 'partial') {
      res.status(206);
      res.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${size}`,
      );
    }
    const stored = await this.fileService.getStream(
      readable.key,
      undefined,
      fileRange,
    );
    if (stored.contentLength !== undefined) {
      res.setHeader('Content-Length', String(stored.contentLength));
    }
    res.on('close', () => stored.stream.destroy());
    return new StreamableFile(stored.stream);
  }
}
