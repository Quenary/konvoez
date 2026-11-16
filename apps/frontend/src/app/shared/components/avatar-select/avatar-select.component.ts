import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LowerCasePipe, NgOptimizedImage } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiAvatar, TuiFileLike, TuiFiles } from '@taiga-ui/kit';
import { TuiButton, TuiHint, TuiLink } from '@taiga-ui/core';
import { startWith, switchMap } from 'rxjs';
import { icons } from '@constants';
import { maxAvatarSize } from '@konvoez/shared';

@Component({
  selector: 'app-avatar-select',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    LowerCasePipe,
    NgOptimizedImage,
    TuiAvatar,
    TuiFiles,
    TuiLink,
    TuiButton,
    TuiHint,
  ],
  templateUrl: './avatar-select.component.html',
  styleUrl: './avatar-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarSelectComponent {
  readonly control = input.required<FormControl<TuiFileLike | null>>();
  readonly avatarUrl = input<string | null | undefined>(null);
  readonly inputId = input<string>('avatar-file');
  readonly maxFileSize = input<number>(maxAvatarSize);
  readonly priority = input<boolean>(false);

  readonly remove = output<void>();

  protected readonly icons = icons;
  protected readonly isDisabled = computed(() => {
    const status = this.controlStatus();
    const ctrl = this.control();
    return ctrl.disabled || status === 'DISABLED';
  });

  private readonly controlStatus = toSignal(
    toObservable(this.control).pipe(
      switchMap((ctrl) => ctrl.statusChanges.pipe(startWith(ctrl.status))),
    ),
  );
  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected onRemove(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.isDisabled()) {
      return;
    }
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.value = '';
    }
    this.control().setValue(null, { emitEvent: false });
    this.remove.emit();
  }
}
