import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { EAttachmentKind } from '@konvoez/shared';
import { FileThumbnailComponent } from '@shared/components/file-thumbnail/file-thumbnail.component';
import { IMediaPreviewItem } from '@shared/components/media-preview/media-preview';
import { MediaPreviewService } from '@shared/components/media-preview/media-preview.service';
import { ILocalFile } from '../outgoing/outgoing.types';

@Component({
  selector: 'app-composer-attachments',
  imports: [FileThumbnailComponent],
  templateUrl: './composer-attachments.component.html',
  styleUrl: './composer-attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComposerAttachmentsComponent {
  private readonly mediaPreviewService = inject(MediaPreviewService);

  protected readonly kinds = EAttachmentKind;

  public readonly files = input.required<readonly ILocalFile[]>();
  public readonly remove = output<string>();

  private readonly strip = viewChild<ElementRef<HTMLDivElement>>('strip');

  constructor() {
    effect(() => {
      const count = this.files().length;
      const element = this.strip()?.nativeElement;
      if (!element || count === 0) {
        return;
      }
      untracked(() => {
        queueMicrotask(() => {
          element.scrollTo({ left: element.scrollWidth });
        });
      });
    });
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
}
