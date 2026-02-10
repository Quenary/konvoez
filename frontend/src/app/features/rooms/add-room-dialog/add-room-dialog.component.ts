import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ERoomType } from '../rooms.enum';
import { IftaLabelModule } from 'primeng/iftalabel';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-add-room-dialog',
  imports: [
    IftaLabelModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  templateUrl: './add-room-dialog.component.html',
  styleUrl: './add-room-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddRoomDialogComponent {
  private readonly dynamicDialogRef = inject(DynamicDialogRef);
  private readonly dynamicDialogConfig = inject(DynamicDialogConfig);
  private readonly translateService = inject(TranslateService);

  protected readonly typeOptions = [
    { name: this.translateService.instant('ROOMS.ADD_DIALOG.TEXT'), value: ERoomType.TEXT },
    { name: this.translateService.instant('ROOMS.ADD_DIALOG.VOICE'), value: ERoomType.VOICE },
  ];
  protected readonly form = new FormGroup({
    name: new FormControl<string | null>(null, [Validators.required]),
    type: new FormControl<ERoomType | null>(null, [Validators.required]),
  });

  constructor() {
    this.form.controls.type.setValue(this.dynamicDialogConfig.data.type);
  }

  submit(): void {
    if (this.form.valid) {
      this.dynamicDialogRef.close(this.form.value);
    }
  }

  close(): void {
    this.dynamicDialogRef.close();
  }
}
