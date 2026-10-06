import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
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
  tuiItemsHandlersProvider,
} from '@taiga-ui/core';
import { TuiChevron, TuiDataListWrapper, TuiSelect } from '@taiga-ui/kit';
import { TuiForm } from '@taiga-ui/layout';
import type { TuiDialogContext } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';

export type TStreamQualityKind = 'cam' | 'screen';

export type TStreamQualityDialogResult = {
  height: TStreamHeight;
  fps: TStreamFps;
};

export type TStreamQualityDialogData = {
  kind: TStreamQualityKind;
  height: TStreamHeight;
  fps: TStreamFps;
};

type TStreamSelectValue = TStreamHeight | TStreamFps;

function stringifyStreamSelectItem(
  item: TStreamSelectValue | null | undefined,
): string {
  if (item == null) {
    return '';
  }
  return (STREAM_HEIGHTS as readonly number[]).includes(item)
    ? `${item}p`
    : String(item);
}

function identityMatchStreamSelectItem(
  a: TStreamSelectValue,
  b: TStreamSelectValue,
): boolean {
  return a === b;
}

@Component({
  selector: 'app-stream-quality-dialog',
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
  providers: [
    tuiItemsHandlersProvider({
      stringify: signal(stringifyStreamSelectItem),
      identityMatcher: signal(identityMatchStreamSelectItem),
    }),
  ],
  templateUrl: './stream-quality-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StreamQualityDialogComponent {
  private readonly context =
    injectContext<
      TuiDialogContext<
        TStreamQualityDialogResult | null,
        TStreamQualityDialogData
      >
    >();

  protected readonly heights = [...STREAM_HEIGHTS];
  protected readonly fpsOptions = [...STREAM_FPS_OPTIONS];

  protected readonly titleKey = computed(() =>
    this.context.data?.kind === 'screen'
      ? 'CALL.SCREEN_SETTINGS'
      : 'CALL.CAMERA_SETTINGS',
  );
  protected readonly confirmKey = computed(() =>
    this.context.data?.kind === 'screen'
      ? 'CALL.START_SCREEN'
      : 'CALL.START_CAMERA',
  );

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
