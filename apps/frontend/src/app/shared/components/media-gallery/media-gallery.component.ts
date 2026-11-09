import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  EAttachmentKind,
  IMediaCounts,
  IMediaGalleryItem,
} from '@konvoez/shared';
import { AttachmentsApiService } from '@core/chat/outgoing/attachments-api.service';
import { MediaPreviewService } from '@shared/components/media-preview/media-preview.service';
import { IMediaPreviewItem } from '@shared/components/media-preview/media-preview';
import { DownloadService } from '@core/services/download.service';
import { formatMediaCount } from '@shared/functions/format-media-count.function';
import { formatFileSize } from '@shared/functions/format-file-size.function';
import { formatVideoDuration } from '@shared/functions/format-video-duration';
import {
  TuiButton,
  TuiHint,
  TuiIcon,
  TuiLoader,
  TuiScrollbar,
} from '@taiga-ui/core';
import { icons } from '@constants';

interface IMediaCategoryView {
  readonly kind: EAttachmentKind;
  readonly count: number;
  readonly label: string;
  readonly icon: string;
}

interface IGalleryItemView extends IMediaGalleryItem {
  readonly formattedSize: string;
  readonly durationLabel: string | null;
}

@Component({
  selector: 'app-media-gallery',
  imports: [
    TranslatePipe,
    TuiButton,
    TuiHint,
    TuiIcon,
    TuiLoader,
    TuiScrollbar,
  ],
  templateUrl: './media-gallery.component.html',
  styleUrl: './media-gallery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaGalleryComponent {
  private readonly attachmentsApiService = inject(AttachmentsApiService);
  private readonly mediaPreviewService = inject(MediaPreviewService);
  private readonly downloadService = inject(DownloadService);
  private readonly translateService = inject(TranslateService);

  public readonly roomId = input<number | null>(null);
  public readonly recipientId = input<number | null>(null);

  public readonly goToMessage = output<string>();

  protected readonly icons = icons;
  protected readonly kinds = EAttachmentKind;

  protected readonly counts = signal<IMediaCounts | null>(null);
  protected readonly loadingCounts = signal(true);
  protected readonly selectedType = signal<EAttachmentKind | null>(null);
  protected readonly items = signal<IMediaGalleryItem[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly hasMore = signal(false);
  protected readonly loadingItems = signal(false);

  private countsRequestId = 0;
  private itemsRequestId = 0;

  protected readonly categories = computed((): IMediaCategoryView[] => {
    const counts = this.counts();
    if (!counts) {
      return [];
    }
    const result: IMediaCategoryView[] = [];

    if (counts.image > 0) {
      result.push({
        kind: EAttachmentKind.IMAGE,
        count: counts.image,
        label: formatMediaCount(
          EAttachmentKind.IMAGE,
          counts.image,
          this.translateService,
        ),
        icon: '@tui.image',
      });
    }

    if (counts.video > 0) {
      result.push({
        kind: EAttachmentKind.VIDEO,
        count: counts.video,
        label: formatMediaCount(
          EAttachmentKind.VIDEO,
          counts.video,
          this.translateService,
        ),
        icon: '@tui.video',
      });
    }

    if (counts.file > 0) {
      result.push({
        kind: EAttachmentKind.FILE,
        count: counts.file,
        label: formatMediaCount(
          EAttachmentKind.FILE,
          counts.file,
          this.translateService,
        ),
        icon: '@tui.file',
      });
    }

    if (counts.audio > 0) {
      result.push({
        kind: EAttachmentKind.AUDIO,
        count: counts.audio,
        label: formatMediaCount(
          EAttachmentKind.AUDIO,
          counts.audio,
          this.translateService,
        ),
        icon: '@tui.music',
      });
    }

    return result;
  });

  protected readonly selectedCategoryLabel = computed(() => {
    const selected = this.selectedType();
    const categories = this.categories();
    if (!selected) {
      return '';
    }
    const match = categories.find((c) => c.kind === selected);
    return match ? match.label : '';
  });

  protected readonly itemViews = computed((): IGalleryItemView[] => {
    const items = this.items();
    return items.map((item) => ({
      ...item,
      formattedSize: formatFileSize(item.size),
      durationLabel:
        item.durationMs !== null ? formatVideoDuration(item.durationMs) : null,
    }));
  });

  constructor() {
    effect(() => {
      const roomId = this.roomId();
      const recipientId = this.recipientId();

      untracked(() => {
        this.itemsRequestId += 1;
        this.selectedType.set(null);
        this.items.set([]);
        this.nextCursor.set(null);
        this.hasMore.set(false);
        this.loadingItems.set(false);
        if (roomId !== null || recipientId !== null) {
          this.loadCounts();
        }
      });
    });
  }

  public refresh(): void {
    this.loadCounts();
    const selected = this.selectedType();
    if (selected) {
      this.loadCategoryItems(selected, true);
    }
  }

  protected selectType(kind: EAttachmentKind): void {
    this.selectedType.set(kind);
    this.loadCategoryItems(kind, true);
  }

  protected clearSelectedType(): void {
    this.itemsRequestId += 1;
    this.selectedType.set(null);
    this.items.set([]);
    this.nextCursor.set(null);
    this.hasMore.set(false);
    this.loadingItems.set(false);
  }

  protected onScroll(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const threshold = 80;
    if (
      target.scrollTop + target.clientHeight >=
      target.scrollHeight - threshold
    ) {
      this.loadMore();
    }
  }

  protected loadMore(): void {
    const selected = this.selectedType();
    const hasMore = this.hasMore();
    const loading = this.loadingItems();
    if (!selected || !hasMore || loading) {
      return;
    }
    this.loadCategoryItems(selected, false);
  }

  protected openPreview(item: IMediaGalleryItem): void {
    const validItems = this.items().filter(
      (i) =>
        i.kind === EAttachmentKind.IMAGE || i.kind === EAttachmentKind.VIDEO,
    );
    const startIndex = validItems.findIndex((i) => i.id === item.id);
    if (startIndex === -1) {
      return;
    }

    const previewItems: IMediaPreviewItem[] = validItems.map((i) => ({
      kind: i.kind as EAttachmentKind.IMAGE | EAttachmentKind.VIDEO,
      src: i.url,
      name: i.name,
      downloadUrl: `${i.url}?download=1`,
      messageId: i.messageId,
    }));

    this.mediaPreviewService
      .open(previewItems, startIndex, (msgId) => this.goToMessage.emit(msgId))
      .subscribe();
  }

  protected downloadItem(item: IMediaGalleryItem): void {
    this.downloadService.downloadUrl(`${item.url}?download=1`, item.name);
  }

  protected onGoToMessageClick(messageId: string): void {
    this.goToMessage.emit(messageId);
  }

  private loadCounts(): void {
    const roomId = this.roomId() ?? undefined;
    const recipientId = this.recipientId() ?? undefined;
    if (roomId === undefined && recipientId === undefined) {
      return;
    }

    const requestId = ++this.countsRequestId;
    this.loadingCounts.set(true);
    this.attachmentsApiService.getCounts({ roomId, recipientId }).subscribe({
      next: (counts) => {
        if (requestId !== this.countsRequestId) {
          return;
        }
        this.counts.set(counts);
        this.loadingCounts.set(false);
      },
      error: () => {
        if (requestId !== this.countsRequestId) {
          return;
        }
        this.loadingCounts.set(false);
      },
    });
  }

  private loadCategoryItems(kind: EAttachmentKind, reset: boolean): void {
    const roomId = this.roomId() ?? undefined;
    const recipientId = this.recipientId() ?? undefined;
    if (roomId === undefined && recipientId === undefined) {
      return;
    }

    const cursor = reset ? undefined : (this.nextCursor() ?? undefined);
    const requestId = ++this.itemsRequestId;
    this.loadingItems.set(true);

    this.attachmentsApiService
      .listMedia({
        roomId,
        recipientId,
        type: kind,
        cursor,
        limit: 30,
      })
      .subscribe({
        next: (response) => {
          if (
            requestId !== this.itemsRequestId ||
            this.selectedType() !== kind ||
            (this.roomId() ?? undefined) !== roomId ||
            (this.recipientId() ?? undefined) !== recipientId
          ) {
            return;
          }
          if (reset) {
            this.items.set(response.items);
          } else {
            this.items.update((prev) => [...prev, ...response.items]);
          }
          this.nextCursor.set(response.nextCursor);
          this.hasMore.set(response.hasMore);
          this.loadingItems.set(false);
        },
        error: () => {
          if (requestId !== this.itemsRequestId) {
            return;
          }
          this.loadingItems.set(false);
        },
      });
  }
}
