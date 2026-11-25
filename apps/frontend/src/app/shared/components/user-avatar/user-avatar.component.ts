import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TuiAutoColorPipe, TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';

@Component({
  selector: 'app-user-avatar',
  imports: [NgOptimizedImage, TuiAvatar, TuiInitialsPipe, TuiAutoColorPipe],
  templateUrl: './user-avatar.component.html',
  styleUrl: './user-avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: TuiAvatar,
      inputs: ['size'],
    },
  ],
  host: {
    '[class.talking]': 'talking()',
    '[class.loaded]': 'isLoaded()',
  },
})
export class UserAvatarComponent {
  public readonly username = input.required<string>();
  public readonly fullname = input.required<string>();
  public readonly avatarUrl = input.required<string | null | undefined>();
  public readonly talking = input<boolean>(false);
  public readonly priority = input<boolean>(false);

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
