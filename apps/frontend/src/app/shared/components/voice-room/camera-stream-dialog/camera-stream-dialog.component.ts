import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  STREAM_FPS_OPTIONS,
  STREAM_HEIGHTS,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import {
  TuiButton,
  TuiDataList,
  TuiDropdown,
  TuiLabel,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiChevron, TuiDataListWrapper, TuiSelect } from '@taiga-ui/kit';
import { TuiForm } from '@taiga-ui/layout';
import type { TuiDialogContext } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';

export type TCameraStreamDialogResult = {
  height: TStreamHeight;
  fps: TStreamFps;
};

export type TCameraStreamDialogData = {
  height: TStreamHeight;
  fps: TStreamFps;
};

@Component({
  selector: 'app-camera-stream-dialog',
  imports: [
    FormsModule,
    TranslatePipe,
    TuiButton,
    TuiLabel,
    TuiSelect,
    TuiTextfield,
    TuiDataList,
    TuiDropdown,
    TuiDataListWrapper,
    TuiChevron,
    TuiForm,
  ],
  templateUrl: './camera-stream-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraStreamDialogComponent {
  private readonly context =
    injectContext<
      TuiDialogContext<
        TCameraStreamDialogResult | null,
        TCameraStreamDialogData
      >
    >();

  protected readonly heights = [...STREAM_HEIGHTS];
  protected readonly fpsOptions = [...STREAM_FPS_OPTIONS];

  protected readonly height = signal<TStreamHeight>(
    this.context.data?.height ?? DEFAULT_STREAM_HEIGHT,
  );
  protected readonly fps = signal<TStreamFps>(
    this.context.data?.fps ?? DEFAULT_STREAM_FPS,
  );

  protected onCancel(): void {
    this.context.completeWith(null);
  }

  protected onConfirm(): void {
    this.context.completeWith({
      height: this.height(),
      fps: this.fps(),
    });
  }
}
