import {
  ChangeDetectionStrategy,
  Component,
  computed,
  linkedSignal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  clampStreamLayers,
  computeSimulcastLayers,
  DEFAULT_STREAM_LAYERS,
  maxStreamLayersForHeight,
  recommendStreamBitrateKbps,
  STREAM_BITRATE_SLIDER_MIN_KBPS,
  STREAM_BITRATE_SLIDER_STEP_KBPS,
  STREAM_BITRATE_WARN_KBPS,
  TStreamContentMode,
} from '@konvoez/shared';
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
  TuiSlider,
  TuiTextfield,
  tuiItemsHandlersProvider,
} from '@taiga-ui/core';
import {
  TuiChevron,
  TuiDataListWrapper,
  TuiInputSlider,
  TuiSelect,
} from '@taiga-ui/kit';
import { TuiRadioList } from '@taiga-ui/kit/components/radio-list';
import { TuiForm } from '@taiga-ui/layout';
import type { TuiDialogContext } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';

export type TStreamQualityKind = 'cam' | 'screen';

export type TStreamQualityDialogResult = {
  height: TStreamHeight;
  fps: TStreamFps;
  layers: number;
  bitrateKbps: number;
  contentMode?: TStreamContentMode;
};

export type TStreamQualityDialogData = {
  kind: TStreamQualityKind;
  height: TStreamHeight;
  fps: TStreamFps;
  layers: number;
  bitrateKbps: number | null;
  contentMode: TStreamContentMode;
  maxBitrateKbps: number;
};

type TStreamSelectValue = TStreamHeight | TStreamFps;

const CONTENT_MODES = ['detail', 'motion'] as const;

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
    TuiSlider,
    TuiInputSlider,
    TuiRadioList,
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
  protected readonly contentModes = CONTENT_MODES;
  protected readonly bitrateMinKbps = STREAM_BITRATE_SLIDER_MIN_KBPS;
  protected readonly bitrateStepKbps = STREAM_BITRATE_SLIDER_STEP_KBPS;

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
  protected readonly isScreen = computed(
    () => this.context.data?.kind === 'screen',
  );

  protected readonly height = signal<TStreamHeight>(
    this.context.data?.height ?? DEFAULT_STREAM_HEIGHT,
  );
  protected readonly fps = signal<TStreamFps>(
    this.context.data?.fps ?? DEFAULT_STREAM_FPS,
  );
  protected readonly contentMode = signal<TStreamContentMode>(
    this.context.data?.contentMode ?? 'detail',
  );

  private readonly initialBitrateKbps = this.context.data?.bitrateKbps ?? null;
  protected readonly maxBitrateKbps =
    this.context.data?.maxBitrateKbps ?? 10000;

  protected readonly maxLayers = computed(() =>
    maxStreamLayersForHeight(this.height()),
  );

  protected readonly layers = linkedSignal<TStreamHeight, number>({
    source: this.height,
    computation: (height, previous) => {
      const requested =
        previous?.value ?? this.context.data?.layers ?? DEFAULT_STREAM_LAYERS;
      return clampStreamLayers(requested, height);
    },
  });

  protected readonly bitrateKbps = linkedSignal<
    {
      height: TStreamHeight;
      fps: TStreamFps;
      contentMode: TStreamContentMode;
    },
    number
  >({
    source: () => ({
      height: this.height(),
      fps: this.fps(),
      contentMode: this.isScreen() ? this.contentMode() : 'motion',
    }),
    computation: (source, previous) => {
      if (!previous && this.initialBitrateKbps != null) {
        return Math.min(
          this.maxBitrateKbps,
          Math.max(STREAM_BITRATE_SLIDER_MIN_KBPS, this.initialBitrateKbps),
        );
      }
      return recommendStreamBitrateKbps({
        height: source.height,
        fps: source.fps,
        contentMode: source.contentMode,
        maxKbps: this.maxBitrateKbps,
      });
    },
  });

  protected readonly layerLines = computed(() => {
    const plan = computeSimulcastLayers({
      height: this.height(),
      fps: this.fps(),
      contentMode: this.isScreen() ? this.contentMode() : 'motion',
      layers: this.layers(),
      maxBitrateBps: this.bitrateKbps() * 1000,
    });
    return [...plan].reverse().map((layer) => ({
      height: layer.height,
      fps: layer.maxFramerate,
    }));
  });

  protected readonly showBitrateWarning = computed(
    () => this.bitrateKbps() > STREAM_BITRATE_WARN_KBPS,
  );

  protected onCancel(): void {
    this.context.completeWith(null);
  }

  protected onConfirm(): void {
    const contentMode = this.isScreen() ? this.contentMode() : undefined;
    this.context.completeWith({
      height: this.height(),
      fps: this.fps(),
      layers: this.layers(),
      bitrateKbps: Math.min(this.maxBitrateKbps, this.bitrateKbps()),
      ...(contentMode ? { contentMode } : {}),
    });
  }
}
