import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ERoomType } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IRoom } from '../rooms.interface';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiDialogContext,
  TuiInput,
  TuiLabel,
  TuiLink,
  TuiNotificationService,
  TuiTextfield,
  tuiItemsHandlersProvider,
} from '@taiga-ui/core';
import { TuiForm } from '@taiga-ui/layout';
import {
  TuiAvatar,
  TuiDataListWrapper,
  TuiFileLike,
  TuiFiles,
  TuiSelect,
} from '@taiga-ui/kit';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomsApiService } from '../rooms-api.service';
import { LowerCasePipe, NgOptimizedImage } from '@angular/common';
import { parseError } from '@shared/functions/parse-error.function';

export type RoomDialogData = Partial<IRoom>;
type TypeOption = {
  name: string;
  value: ERoomType;
};

/**
 * Create/update room dialog component
 */
@Component({
  selector: 'app-room-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    LowerCasePipe,
    NgOptimizedImage,
    TuiButton,
    TuiForm,
    TuiInput,
    TuiTextfield,
    TuiLabel,
    TuiSelect,
    TuiDataListWrapper,
    TuiFiles,
    TuiAvatar,
    TuiLink,
  ],
  providers: [
    tuiItemsHandlersProvider({
      stringify: signal((a: TypeOption) => a.name),
      identityMatcher: signal(
        (a: TypeOption, b: TypeOption) => a.value === b.value,
      ),
    }),
  ],
  templateUrl: './room-dialog.component.html',
  styleUrl: './room-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomDialogComponent {
  private readonly context =
    injectContext<TuiDialogContext<RoomDialogData | null, RoomDialogData>>();
  private readonly translateService = inject(TranslateService);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  protected readonly typeOptions: TypeOption[] = [
    {
      name: this.translateService.instant('ROOMS.DIALOG.TEXT'),
      value: ERoomType.TEXT,
    },
    {
      name: this.translateService.instant('ROOMS.DIALOG.VOICE'),
      value: ERoomType.VOICE,
    },
  ];
  protected readonly form = new FormGroup({
    name: new FormControl<string | null>(null, [Validators.required]),
    type: new FormControl<TypeOption | null>(null, [Validators.required]),
    avatar: new FormControl<string | null>(null),
    avatarFile: new FormControl<TuiFileLike | null>(null),
  });
  protected readonly avatarUrl = signal<string | null>(
    this.context.data.avatarUrl ?? null,
  );

  constructor() {
    this.form.patchValue({
      name: this.context.data.name,
      type:
        this.typeOptions.find(
          (item) => item.value === this.context.data.type,
        ) || null,
      avatar: this.context.data.avatar ?? null,
    });

    this.form.controls.avatarFile.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((avatarFile) => {
        if (avatarFile) {
          this.roomsApiService.avatarUpload(avatarFile as File).subscribe({
            next: (result) => {
              this.form.patchValue({
                avatar: result.key,
              });
              this.avatarUrl.set(result.url);
            },
            error: (err) => {
              this.tuiNotificationsService
                .open(parseError(err), {
                  appearance: 'negative',
                  autoClose: 5000,
                  closable: true,
                  label: this.translateService.instant('GENERAL.REQ_ERR'),
                })
                .subscribe();
            },
          });
        }
      });
  }

  submit(): void {
    if (this.form.valid) {
      const { name, type, avatar } = this.form.value as {
        name: string;
        type: TypeOption;
        avatar: string | null;
      };

      this.context.completeWith({
        ...this.context.data,
        name: name,
        type: type.value,
        avatar: avatar ?? undefined,
        avatarUrl: this.avatarUrl(),
      });
    }
  }

  close(): void {
    this.context.completeWith(null);
  }
}
