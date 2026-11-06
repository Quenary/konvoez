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
  DEFAULT_STREAM_MAX_BITRATE_KBPS,
  DEFAULT_STREAM_VIDEO_CODEC,
  defaultExtraLayers,
  formatStreamLayer,
  recommendStreamBitrateKbps,
  STREAM_BITRATE_SLIDER_MIN_KBPS,
  STREAM_BITRATE_SLIDER_STEP_KBPS,
  STREAM_BITRATE_WARN_KBPS,
  STREAM_EXTRA_LAYERS_MAX,
  streamLayerOptions,
  streamSupportsSimulcast,
  TStreamContentMode,
  TStreamLayer,
  TStreamVideoCodec,
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
  TuiMultiSelect,
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
  extraLayers: TStreamLayer[];
  bitrateKbps: number;
  codec: TStreamVideoCodec;
  contentMode?: TStreamContentMode;
};

export type TStreamQualityDialogData = {
  kind: TStreamQualityKind;
  height: TStreamHeight;
  fps: TStreamFps;
  extraLayers: TStreamLayer[] | null;
  bitrateKbps: number | null;
  contentMode: TStreamContentMode;
  codec: TStreamVideoCodec;
  codecs: readonly TStreamVideoCodec[];
  maxBitrateKbps: number;
};

type TStreamSelectValue = TStreamHeight | TStreamFps | TStreamVideoCodec;

const CODEC_LABELS: Record<TStreamVideoCodec, string> = {
  h264: 'H.264',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
};

function initialCodec(
  codec: TStreamVideoCodec | undefined,
  codecs: readonly TStreamVideoCodec[] | undefined,
): TStreamVideoCodec {
  const available = codecs?.length ? codecs : (['vp9', 'vp8'] as const);
  if (codec && available.includes(codec)) {
    return codec;
  }
  if (available.includes(DEFAULT_STREAM_VIDEO_CODEC)) {
    return DEFAULT_STREAM_VIDEO_CODEC;
  }
  if (available.includes('vp8')) {
    return 'vp8';
  }
  return available[0] ?? 'vp8';
}

const CONTENT_MODES = ['detail', 'motion'] as const;

function stringifyStreamSelectItem(
  item: TStreamSelectValue | null | undefined,
): string {
  if (item == null) {
    return '';
  }
  if (typeof item === 'string') {
    return CODEC_LABELS[item] ?? item;
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
    TuiMultiSelect,
    TuiTextfield,
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
  protected readonly codecs: readonly TStreamVideoCodec[] = this.context.data
    ?.codecs?.length
    ? this.context.data.codecs
    : ['vp9', 'vp8'];
  protected readonly codec = signal<TStreamVideoCodec>(
    initialCodec(this.context.data?.codec, this.codecs),
  );

  private readonly initialBitrateKbps = this.context.data?.bitrateKbps ?? null;
  private readonly dropsStoredLayers =
    !streamSupportsSimulcast(this.codec()) &&
    (this.context.data?.extraLayers?.length ?? 1) > 0;
  private readonly keepStoredBitrate =
    this.initialBitrateKbps != null &&
    !this.dropsStoredLayers &&
    (this.context.data?.codec === this.codec() ||
      (this.context.data?.codec != null &&
        streamSupportsSimulcast(this.context.data.codec) &&
        streamSupportsSimulcast(this.codec())));
  protected readonly maxBitrateKbps =
    this.context.data?.maxBitrateKbps ?? DEFAULT_STREAM_MAX_BITRATE_KBPS;

  protected readonly extraLayers = linkedSignal<
    { height: TStreamHeight; fps: TStreamFps; simulcast: boolean },
    TStreamLayer[]
  >({
    source: () => ({
      height: this.height(),
      fps: this.fps(),
      simulcast: streamSupportsSimulcast(this.codec()),
    }),
    computation: (source, previous) => {
      if (!source.simulcast) {
        return [];
      }
      if (previous) {
        return defaultExtraLayers(source);
      }
      const stored = this.context.data?.extraLayers ?? null;
      if (stored == null) {
        return defaultExtraLayers(source);
      }
      const options = streamLayerOptions(source);
      return stored
        .filter((layer) =>
          options.some(
            (option) =>
              option.height === layer.height && option.fps === layer.fps,
          ),
        )
        .slice(0, STREAM_EXTRA_LAYERS_MAX);
    },
  });

  protected readonly layerOptions = computed(() =>
    streamLayerOptions({ height: this.height(), fps: this.fps() }),
  );

  protected readonly simulcastSupported = computed(() =>
    streamSupportsSimulcast(this.codec()),
  );

  protected readonly stringifyLayer = (layer: TStreamLayer): string =>
    formatStreamLayer(layer);

  protected readonly matchLayer = (
    left: TStreamLayer,
    right: TStreamLayer,
  ): boolean => left.height === right.height && left.fps === right.fps;

  protected readonly extraLayerDisabled = (layer: TStreamLayer): boolean => {
    const selected = this.extraLayers();
    const checked = selected.some((item) => this.matchLayer(item, layer));
    return !checked && selected.length >= STREAM_EXTRA_LAYERS_MAX;
  };

  protected readonly bitrateKbps = linkedSignal<
    {
      height: TStreamHeight;
      fps: TStreamFps;
      contentMode: TStreamContentMode;
      extra: TStreamLayer[];
      codec: TStreamVideoCodec;
    },
    number
  >({
    source: () => {
      const height = this.height();
      const fps = this.fps();
      const contentMode = this.contentMode();
      const screen = this.isScreen();
      const extra = this.extraLayers();
      const codec = this.codec();
      return {
        height,
        fps,
        contentMode: screen ? contentMode : 'motion',
        extra,
        codec,
      };
    },
    computation: (source, previous) => {
      if (
        !previous &&
        this.keepStoredBitrate &&
        this.initialBitrateKbps != null
      ) {
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
        extra: source.extra,
        codec: source.codec,
      });
    },
  });

  protected readonly showBitrateWarning = computed(
    () => this.bitrateKbps() > STREAM_BITRATE_WARN_KBPS,
  );

  protected onExtraLayersChange(layers: readonly TStreamLayer[]): void {
    this.extraLayers.set(layers.slice(0, STREAM_EXTRA_LAYERS_MAX));
  }

  protected onCancel(): void {
    this.context.completeWith(null);
  }

  protected onConfirm(): void {
    const contentMode = this.isScreen() ? this.contentMode() : undefined;
    this.context.completeWith({
      height: this.height(),
      fps: this.fps(),
      extraLayers: this.extraLayers(),
      bitrateKbps: Math.min(this.maxBitrateKbps, this.bitrateKbps()),
      codec: this.codec(),
      ...(contentMode ? { contentMode } : {}),
    });
  }
}
