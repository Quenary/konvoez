import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ERoomType } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IRoom } from '../rooms.interface';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiDialogContext,
  TuiError,
  TuiInput,
  TuiLabel,
  TuiLink,
  TuiNotificationService,
  TuiTextfield,
  TUI_ITEMS_HANDLERS,
  TUI_DEFAULT_ITEMS_HANDLERS,
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
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { roomFormSchema } from '@shared/schemas/forms.schema';

export type RoomDialogData = Partial<IRoom>;

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
    TuiError,
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
    {
      provide: TUI_ITEMS_HANDLERS,
      useFactory: () => {
        const translateService = inject(TranslateService);
        return {
          stringify: signal((type: ERoomType) =>
            translateService.instant(
              type === ERoomType.TEXT
                ? 'ROOMS.DIALOG.TEXT'
                : 'ROOMS.DIALOG.VOICE',
            ),
          ),
          identityMatcher: TUI_DEFAULT_ITEMS_HANDLERS.identityMatcher,
          disabledItemHandler: TUI_DEFAULT_ITEMS_HANDLERS.disabledItemHandler,
        };
      },
    },
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

  protected readonly typeOptions = [ERoomType.TEXT, ERoomType.VOICE];
  protected readonly form = new FormGroup(
    {
      name: new FormControl(this.context.data.name ?? '', {
        nonNullable: true,
        validators: [createZodFieldValidator(roomFormSchema.shape.name)],
      }),
      type: new FormControl(this.context.data.type ?? ERoomType.TEXT, {
        nonNullable: true,
        validators: [createZodFieldValidator(roomFormSchema.shape.type)],
      }),
      avatar: new FormControl<string | null>(this.context.data.avatar ?? null),
      avatarFile: new FormControl<TuiFileLike | null>(null),
    },
    {
      validators: [createZodFormValidator(roomFormSchema)],
    },
  );
  protected readonly errors = createZodError(this.form, roomFormSchema);
  protected readonly avatarUrl = signal<string | null>(
    this.context.data.avatarUrl ?? null,
  );

  constructor() {
    this.form.controls.avatarFile.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((avatarFile) => {
        if (!avatarFile) {
          return;
        }
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
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, type, avatar } = this.form.getRawValue();
    this.context.completeWith({
      ...this.context.data,
      name,
      type,
      avatar: avatar ?? undefined,
      avatarUrl: this.avatarUrl(),
    });
  }

  close(): void {
    this.context.completeWith(null);
  }
}
