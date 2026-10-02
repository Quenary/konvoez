import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { EAttachmentKind } from '@konvoez/shared';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint, TuiIcon, TuiLoader } from '@taiga-ui/core';
import { TuiProgress } from '@taiga-ui/kit';

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

@Component({
  selector: 'app-file-thumbnail',
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    TuiButton,
    TuiHint,
    TuiIcon,
    TuiLoader,
    TuiProgress,
  ],
  templateUrl: './file-thumbnail.component.html',
  styleUrl: './file-thumbnail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class._error]': 'status() === "error"',
    '[class._fill]': 'fill()',
  },
})
export class FileThumbnailComponent {
  public readonly name = input.required<string>();
  public readonly kind = input.required<EAttachmentKind>();
  public readonly src = input<string | null>(null);
  public readonly size = input<number | null>(null);
  public readonly status = input<
    'idle' | 'queued' | 'uploading' | 'done' | 'error'
  >('idle');
  public readonly progress = input<number | null>(null);
  public readonly removable = input(false);
  public readonly errorText = input<string | null>(null);
  public readonly fill = input(false, { transform: booleanAttribute });
  public readonly interactive = input(false, { transform: booleanAttribute });
  public readonly serverVideo = input(false);

  public readonly remove = output<void>();
  public readonly activate = output<void>();

  protected readonly broken = signal(false);
  protected readonly kinds = EAttachmentKind;
  protected readonly showImage = computed(() => {
    const kind = this.kind();
    const src = this.src();
    const broken = this.broken();
    return (
      kind === EAttachmentKind.IMAGE && !!src && !broken && !this.serverVideo()
    );
  });
  protected readonly showLocalVideo = computed(() => {
    const kind = this.kind();
    const src = this.src();
    const broken = this.broken();
    const serverVideo = this.serverVideo();
    return kind === EAttachmentKind.VIDEO && !!src && !broken && !serverVideo;
  });

  protected readonly icon = computed(() => {
    const kind = this.kind();
    switch (kind) {
      case EAttachmentKind.IMAGE:
        return '@tui.image';
      case EAttachmentKind.VIDEO:
        return '@tui.video';
      case EAttachmentKind.AUDIO:
        return '@tui.music';
      default:
        return '@tui.file';
    }
  });
  protected readonly formattedSize = computed(() => {
    const size = this.size();
    return size === null ? null : formatSize(size);
  });

  protected onBroken(): void {
    this.broken.set(true);
  }

  protected onRemove(event: Event): void {
    event.stopPropagation();
    this.remove.emit();
  }

  protected onActivate(): void {
    if (!this.interactive()) {
      return;
    }
    this.activate.emit();
  }
}
