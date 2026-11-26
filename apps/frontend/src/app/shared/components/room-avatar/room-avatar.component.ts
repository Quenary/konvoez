import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';

@Component({
  selector: 'app-room-avatar',
  imports: [NgOptimizedImage, TuiAvatar, TuiInitialsPipe],
  templateUrl: './room-avatar.component.html',
  styleUrl: './room-avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: TuiAvatar,
      inputs: ['size'],
    },
  ],
  host: {
    '[class.loaded]': 'isLoaded()',
  },
})
export class RoomAvatarComponent {
  public readonly name = input.required<string>();
  public readonly initialsSource = input<string | null>(null);
  public readonly avatarUrl = input.required<string | null | undefined>();
  public readonly color = input<string | null>(null);
  public readonly priority = input<boolean>(false);

  protected readonly initialsText = computed(() => {
    const source = this.initialsSource();
    const name = this.name();
    return source || name;
  });
  protected readonly isLoaded = signal(false);
  protected readonly hasError = signal(false);

  private readonly avatarImg =
    viewChild<ElementRef<HTMLImageElement>>('avatarImg');

  constructor() {
    effect(() => {
      this.avatarUrl();
      untracked(() => {
        this.isLoaded.set(false);
        this.hasError.set(false);
      });
    });

    afterRenderEffect(() => {
      const url = this.avatarUrl();
      const img = this.avatarImg()?.nativeElement;
      const errored = this.hasError();
      if (url && img && !errored && img.complete && img.naturalWidth > 0) {
        this.isLoaded.set(true);
      }
    });
  }

  protected onImageLoad(): void {
    this.hasError.set(false);
    this.isLoaded.set(true);
  }

  protected onImageError(): void {
    this.isLoaded.set(false);
    this.hasError.set(true);
  }
}
