import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { EAttachmentKind } from '@konvoez/shared';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton } from '@taiga-ui/core';
import type { TuiContext } from '@taiga-ui/cdk/types';
import { TuiPreview } from '@taiga-ui/kit';
import { injectContext } from '@taiga-ui/polymorpheus';
import type { Observer } from 'rxjs';
import { MEDIA_PREVIEW_DATA } from './media-preview';

@Component({
  selector: 'app-media-preview',
  imports: [TranslatePipe, TuiButton, TuiPreview],
  templateUrl: './media-preview.component.html',
  styleUrl: './media-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class MediaPreviewComponent {
  private readonly data = inject(MEDIA_PREVIEW_DATA);
  private readonly context = injectContext<TuiContext<Observer<void>>>();

  protected readonly items = this.data.items;
  protected readonly index = signal(this.data.startIndex);
  protected readonly broken = signal(false);
  protected readonly kinds = EAttachmentKind;

  protected readonly current = computed(
    () => this.items[this.index()] ?? this.items[0],
  );
  protected readonly isImage = computed(
    () => this.current()?.kind === EAttachmentKind.IMAGE,
  );

  protected close(): void {
    this.context.$implicit.complete();
  }

  protected onIndex(index: number): void {
    this.broken.set(false);
    this.index.set(index);
  }

  protected onBroken(): void {
    this.broken.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      this.onIndex(Math.min(this.items.length - 1, this.index() + 1));
    }
    if (event.key === 'ArrowLeft') {
      this.onIndex(Math.max(0, this.index() - 1));
    }
  }
}
