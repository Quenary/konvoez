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
import { IRoom, IRoomCreate } from '../rooms.interface';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiDialogContext,
  TuiInput,
  tuiItemsHandlersProvider,
  TuiLabel,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiForm } from '@taiga-ui/layout';
import { TuiDataListWrapper, TuiSelect } from '@taiga-ui/kit';

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
    TuiButton,
    TuiForm,
    TuiInput,
    TuiTextfield,
    TuiLabel,
    TuiSelect,
    TuiDataListWrapper,
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
  });

  constructor() {
    this.form.patchValue({
      name: this.context.data.name,
      type:
        this.typeOptions.find(
          (item) => item.value === this.context.data.type,
        ) || null,
    });
  }

  submit(): void {
    if (this.form.valid) {
      const { name, type } = this.form.value as {
        name: string;
        type: TypeOption;
      };

      this.context.completeWith({
        ...this.context.data,
        name: name,
        type: type.value,
      });
    }
  }

  close(): void {
    this.context.completeWith(null);
  }
}
