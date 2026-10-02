import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  attachmentsAnimatedInlineMaxSize,
  EAttachmentKind,
  IAttachment,
} from '@konvoez/shared';
import { TuiFile } from '@taiga-ui/kit';
import { FileThumbnailComponent } from '@shared/components/file-thumbnail/file-thumbnail.component';
import { MediaGridComponent } from '@shared/components/media-grid/media-grid.component';
import { IMediaPreviewItem } from '@shared/components/media-preview/media-preview';
import { MediaPreviewService } from '@shared/components/media-preview/media-preview.service';

export interface IAttachmentView {
  readonly key: string;
  readonly kind: EAttachmentKind;
  readonly name: string;
  readonly size: number;
  readonly src: string | null;
  readonly fullSrc: string | null;
  readonly downloadUrl: string | null;
  readonly status: 'idle' | 'queued' | 'uploading' | 'done' | 'error';
  readonly fileState: 'normal' | 'loading' | 'error';
  readonly progress: number | null;
  readonly errorText: string | null;
  readonly removable: boolean;
  readonly serverVideo: boolean;
}

@Component({
  selector: 'app-message-attachments',
  imports: [TuiFile, FileThumbnailComponent, MediaGridComponent],
  templateUrl: './message-attachments.component.html',
  styleUrl: './message-attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageAttachmentsComponent {
  private readonly mediaPreviewService = inject(MediaPreviewService);

  public readonly attachments = input<readonly IAttachment[]>([]);
  public readonly removeFile = output<string>();

  protected readonly views = computed(() =>
    this.attachments().map((attachment) => this.toView(attachment)),
  );
  protected readonly media = computed(() =>
    this.views().filter(
      (item) =>
        item.kind === EAttachmentKind.IMAGE ||
        item.kind === EAttachmentKind.VIDEO,
    ),
  );
  protected readonly audio = computed(() =>
    this.views().filter((item) => item.kind === EAttachmentKind.AUDIO),
  );
  protected readonly files = computed(() =>
    this.views().filter(
      (item) =>
        item.kind !== EAttachmentKind.IMAGE &&
        item.kind !== EAttachmentKind.VIDEO &&
        item.kind !== EAttachmentKind.AUDIO,
    ),
  );
  protected readonly aspect = computed(() => {
    const first = this.media()[0];
    const source = this.attachments().find((item) => item.id === first?.key);
    if (!source?.width || !source.height) {
      return null;
    }
    return { width: source.width, height: source.height };
  });

  protected open(index: number): void {
    const items: IMediaPreviewItem[] = this.media()
      .filter(
        (item): item is IAttachmentView & { fullSrc: string } =>
          !!item.fullSrc &&
          (item.kind === EAttachmentKind.IMAGE ||
            item.kind === EAttachmentKind.VIDEO),
      )
      .map((item) => ({
        kind: item.kind as EAttachmentKind.IMAGE | EAttachmentKind.VIDEO,
        src: item.fullSrc,
        name: item.name,
        downloadUrl: item.downloadUrl,
      }));
    if (items.length === 0) {
      return;
    }
    this.mediaPreviewService.open(items, index).subscribe();
  }

  private toView(attachment: IAttachment): IAttachmentView {
    const animated =
      attachment.mime === 'image/gif' &&
      attachment.size <= attachmentsAnimatedInlineMaxSize;
    const src =
      attachment.kind === EAttachmentKind.IMAGE
        ? animated
          ? attachment.url
          : (attachment.thumbnailUrl ?? attachment.url)
        : null;
    return {
      key: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      size: attachment.size,
      src,
      fullSrc: attachment.url,
      downloadUrl: `${attachment.url}?download=1`,
      status: 'done',
      fileState: 'normal',
      progress: null,
      errorText: null,
      removable: false,
      serverVideo: attachment.kind === EAttachmentKind.VIDEO,
    };
  }
}
