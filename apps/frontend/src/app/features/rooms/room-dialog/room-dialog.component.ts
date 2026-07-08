import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ERoomType } from '@konvoez/common';
import { IftaLabelModule } from 'primeng/iftalabel';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

/**
 * Create/update room dialog component
 */
@Component({
  selector: 'app-room-dialog',
  imports: [
    IftaLabelModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  templateUrl: './room-dialog.component.html',
  styleUrl: './room-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomDialogComponent {
  private readonly dynamicDialogRef = inject(DynamicDialogRef);
  private readonly dynamicDialogConfig = inject(DynamicDialogConfig);
  private readonly translateService = inject(TranslateService);

  protected id: number | null = null;
  protected readonly typeOptions = [
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
    type: new FormControl<ERoomType | null>(null, [Validators.required]),
  });

  constructor() {
    this.id = this.dynamicDialogConfig.data?.id;
    this.form.patchValue({
      ...this.dynamicDialogConfig.data,
    });
  }

  submit(): void {
    if (this.form.valid) {
      this.dynamicDialogRef.close({
        id: this.id,
        room: this.form.value,
      });
    }
  }

  close(): void {
    this.dynamicDialogRef.close();
  }
}
