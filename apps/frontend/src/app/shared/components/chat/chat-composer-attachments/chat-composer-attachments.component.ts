import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { EAttachmentKind } from '@konvoez/shared';
import { FileThumbnailComponent } from '@shared/components/file-thumbnail/file-thumbnail.component';
import { IMediaPreviewItem } from '@shared/components/media-preview/media-preview';
import { MediaPreviewService } from '@shared/components/media-preview/media-preview.service';
import { ILocalFile } from '@features/text-room/outgoing/outgoing.types';

@Component({
  selector: 'app-chat-composer-attachments',
  imports: [FileThumbnailComponent],
  templateUrl: './chat-composer-attachments.component.html',
  styleUrl: './chat-composer-attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComposerAttachmentsComponent {
  private readonly mediaPreviewService = inject(MediaPreviewService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly files = input.required<readonly ILocalFile[]>();
  public readonly remove = output<string>();

  protected readonly kinds = EAttachmentKind;
  protected readonly canScrollStart = signal(false);
  protected readonly canScrollEnd = signal(false);

  private readonly strip = viewChild<ElementRef<HTMLDivElement>>('strip');

  constructor() {
    afterNextRender(() => this.observeStrip());
    effect(() => {
      const count = this.files().length;
      const element = this.strip()?.nativeElement;
      if (!element || count === 0) {
        return;
      }
      untracked(() => {
        queueMicrotask(() => {
          element.scrollTo({ left: element.scrollWidth });
          requestAnimationFrame(() => this.updateEdges());
        });
      });
    });
  }

  protected onScroll(): void {
    this.updateEdges();
  }

  protected open(file: ILocalFile): void {
    const media = this.files().filter(
      (
        item,
      ): item is ILocalFile & {
        previewUrl: string;
        kind: EAttachmentKind.IMAGE | EAttachmentKind.VIDEO;
      } =>
        !!item.previewUrl &&
        (item.kind === EAttachmentKind.IMAGE ||
          item.kind === EAttachmentKind.VIDEO),
    );
    const index = media.findIndex((item) => item.localId === file.localId);
    if (index < 0) {
      return;
    }
    const items: IMediaPreviewItem[] = media.map((item) => ({
      kind: item.kind,
      src: item.previewUrl,
      name: item.file.name,
      downloadUrl: null,
    }));
    this.mediaPreviewService.open(items, index).subscribe();
  }

  private observeStrip(): void {
    const element = this.strip()?.nativeElement;
    if (!element || typeof ResizeObserver === 'undefined') {
      this.updateEdges();
      return;
    }
    const observer = new ResizeObserver(() => this.updateEdges());
    observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
    this.updateEdges();
  }

  private updateEdges(): void {
    const element = this.strip()?.nativeElement;
    if (!element) {
      this.canScrollStart.set(false);
      this.canScrollEnd.set(false);
      return;
    }
    const slack = element.scrollWidth - element.clientWidth;
    const scrollLeft = Math.abs(element.scrollLeft);
    this.canScrollStart.set(scrollLeft > 1);
    this.canScrollEnd.set(slack - scrollLeft > 1);
  }
}
