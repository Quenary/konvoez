import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Injectable,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_STREAM_MAX_BITRATE_KBPS,
  DEFAULT_STREAM_SVC_MODE,
  defaultExtraLayers,
  formatStreamLayer,
  recommendStreamBitrateKbps,
  STREAM_BITRATE_SLIDER_MIN_KBPS,
  STREAM_BITRATE_SLIDER_STEP_KBPS,
  STREAM_BITRATE_WARN_KBPS,
  STREAM_EXTRA_LAYERS_MAX,
  STREAM_SVC_MODES,
  streamLayerOptions,
  streamSupportsSimulcast,
  streamSupportsSvc,
  TStreamContentMode,
  TStreamLayer,
  TStreamSvcMode,
  TStreamVideoCodec,
} from '@konvoez/shared';
import {
  pickDefaultVideoCodec,
  resolveDefaultVideoCodec,
  streamProbeBitrateKbps,
} from '@core/services/video-codec';
import { StreamCameraPreviewComponent } from './stream-camera-preview.component';
import {
  DEFAULT_SCREEN_CONTENT_MODE,
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  STREAM_FPS_OPTIONS,
  STREAM_HEIGHTS,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import {
  TUI_ITEMS_HANDLERS,
  TuiButton,
  TuiDropdown,
  TuiLabel,
  TuiSlider,
  TuiTextfield,
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
  svcMode: TStreamSvcMode;
  bitrateKbps: number;
  codec: TStreamVideoCodec;
  contentMode?: TStreamContentMode;
  videoInput: MediaDeviceInfo | null;
};

export type TStreamQualityDialogData = {
  kind: TStreamQualityKind;
  height: TStreamHeight;
  fps: TStreamFps;
  extraLayers: TStreamLayer[] | null;
  svcMode: TStreamSvcMode | null;
  bitrateKbps: number | null;
  contentMode: TStreamContentMode;
  codec: TStreamVideoCodec | null;
  codecs: readonly TStreamVideoCodec[];
  maxBitrateKbps: number;
  videoInput: MediaDeviceInfo | null;
};

type TStreamSelectValue = TStreamHeight | TStreamFps | TStreamVideoCodec;

const CODEC_LABELS: Record<TStreamVideoCodec, string> = {
  h264: 'H.264',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
};

const SVC_MODE_LABELS: Record<TStreamSvcMode, string> = {
  L1T3: 'CALL.STREAM_SVC_L1',
  L2T3_KEY: 'CALL.STREAM_SVC_L2',
  L3T3_KEY: 'CALL.STREAM_SVC_L3',
};

function isSvcMode(value: string): value is TStreamSvcMode {
  return (STREAM_SVC_MODES as readonly string[]).includes(value);
}

function initialCodec(
  codec: TStreamVideoCodec | null | undefined,
  codecs: readonly TStreamVideoCodec[] | undefined,
): TStreamVideoCodec {
  const available = codecs?.length ? codecs : (['vp9', 'vp8'] as const);
  if (codec && available.includes(codec)) {
    return codec;
  }
  return pickDefaultVideoCodec({
    available,
    hardware: { av1: false, h264: false },
  });
}

const CONTENT_MODES = ['detail', 'motion'] as const;
const HARDWARE_PROBE_DEBOUNCE_MS = 200;

type THardwareProbeInput = {
  height: TStreamHeight;
  fps: TStreamFps;
  contentMode: TStreamContentMode;
};

@Injectable()
class DialogHardwareLabel {
  readonly codec = signal<'av1' | 'h264' | null>(null);
}

function stringifyStreamSelectItem(
  item: TStreamSelectValue | TStreamSvcMode | null | undefined,
  translate: (key: string) => string,
): string {
  if (item == null) {
    return '';
  }
  if (typeof item === 'string') {
    if (isSvcMode(item)) {
      return translate(SVC_MODE_LABELS[item]);
    }
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
    StreamCameraPreviewComponent,
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
    DialogHardwareLabel,
    {
      provide: TUI_ITEMS_HANDLERS,
      useFactory: () => {
        const translateService = inject(TranslateService);
        const hardwareLabel = inject(DialogHardwareLabel);
        return {
          stringify: signal(
            (item: TStreamSelectValue | TStreamSvcMode | null | undefined) => {
              const hardwareCodec = hardwareLabel.codec();
              const label = stringifyStreamSelectItem(item, (key) =>
                translateService.instant(key),
              );
              if (item != null && item === hardwareCodec) {
                return `${label} (${translateService.instant('CALL.STREAM_CODEC_HARDWARE')})`;
              }
              return label;
            },
          ),
          identityMatcher: signal(identityMatchStreamSelectItem),
          disabledItemHandler: signal(() => false),
        };
      },
    },
  ],
  templateUrl: './stream-quality-dialog.component.html',
  styleUrl: './stream-quality-dialog.component.scss',
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
  private readonly hardwareLabel = inject(DialogHardwareLabel);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly heights = [...STREAM_HEIGHTS];
  protected readonly fpsOptions = [...STREAM_FPS_OPTIONS];
  protected readonly contentModes = CONTENT_MODES;
  protected readonly svcModes = [...STREAM_SVC_MODES];
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
    this.context.data?.contentMode ?? DEFAULT_SCREEN_CONTENT_MODE,
  );
  protected readonly codecs: readonly TStreamVideoCodec[] = this.context.data
    ?.codecs?.length
    ? this.context.data.codecs
    : ['vp9', 'vp8'];
  protected readonly codec = signal<TStreamVideoCodec>(
    initialCodec(this.context.data?.codec, this.codecs),
  );
  private codecLocked =
    this.context.data?.codec != null &&
    this.codecs.includes(this.context.data.codec);
  private latestProbe: THardwareProbeInput | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | undefined;
  private probeGeneration = 0;
  private probeSettled: Promise<void> = Promise.resolve();
  private resolveProbeSettled: () => void = () => undefined;
  private confirming = false;
  private closed = false;

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

  protected readonly svcMode = linkedSignal<{ svc: boolean }, TStreamSvcMode>({
    source: () => ({
      svc: streamSupportsSvc(this.codec()),
    }),
    computation: (source, previous) => {
      const stored = this.context.data?.svcMode;
      const fallback = stored ?? DEFAULT_STREAM_SVC_MODE;
      if (!previous) {
        return fallback;
      }
      if (source.svc !== previous.source.svc) {
        return DEFAULT_STREAM_SVC_MODE;
      }
      return previous.value;
    },
  });

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
      svcMode: TStreamSvcMode;
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
      const svcMode = this.svcMode();
      return {
        height,
        fps,
        contentMode: screen ? contentMode : 'motion',
        extra,
        codec,
        svcMode,
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
        svcMode: streamSupportsSvc(source.codec) ? source.svcMode : undefined,
      });
    },
  });

  protected readonly showBitrateWarning = computed(
    () => this.bitrateKbps() > STREAM_BITRATE_WARN_KBPS,
  );
  protected readonly storedVideoInput = this.context.data?.videoInput ?? null;
  protected readonly selectedCamera = signal<MediaDeviceInfo | null>(null);
  protected readonly previewBlocked = signal(true);
  protected readonly confirmDisabled = computed(() => {
    const screen = this.isScreen();
    const blocked = this.previewBlocked();
    return !screen && blocked;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.closed = true;
      this.probeGeneration += 1;
      this.clearProbeTimer();
      this.resolveProbeSettled();
    });
    effect(() => {
      const height = this.height();
      const fps = this.fps();
      const contentMode = this.contentMode();
      const screen = this.isScreen();
      this.scheduleHardwareProbe({
        height,
        fps,
        contentMode: screen ? contentMode : 'motion',
      });
    });
  }

  protected onCodecChange(codec: TStreamVideoCodec): void {
    this.codecLocked = true;
    this.codec.set(codec);
  }

  protected onExtraLayersChange(layers: readonly TStreamLayer[]): void {
    this.extraLayers.set(layers.slice(0, STREAM_EXTRA_LAYERS_MAX));
  }

  protected onCancel(): void {
    this.context.completeWith(null);
  }

  protected async onConfirm(): Promise<void> {
    if (this.confirming) {
      return;
    }
    this.confirming = true;
    try {
      await this.flushHardwareProbe();
      if (this.closed || this.confirmDisabled()) {
        return;
      }
      const contentMode = this.isScreen() ? this.contentMode() : undefined;
      const videoInput = this.isScreen() ? null : this.selectedCamera();
      this.context.completeWith({
        height: this.height(),
        fps: this.fps(),
        extraLayers: this.extraLayers(),
        svcMode: this.svcMode(),
        bitrateKbps: Math.min(this.maxBitrateKbps, this.bitrateKbps()),
        codec: this.codec(),
        videoInput,
        ...(contentMode ? { contentMode } : {}),
      });
    } finally {
      this.confirming = false;
    }
  }

  private scheduleHardwareProbe(input: THardwareProbeInput): void {
    this.latestProbe = input;
    const cancelWaitingTimer = this.probeTimer != null;
    const resolveCancelled = this.resolveProbeSettled;
    this.clearProbeTimer();
    if (cancelWaitingTimer) {
      resolveCancelled();
    }
    const generation = ++this.probeGeneration;
    let resolveSettled = (): void => undefined;
    this.probeSettled = new Promise<void>((resolve) => {
      resolveSettled = () => {
        resolve();
        resolveSettled = () => undefined;
      };
    });
    this.resolveProbeSettled = resolveSettled;
    this.probeTimer = setTimeout(() => {
      this.probeTimer = undefined;
      void this.applyHardwareProbe(input, generation).finally(resolveSettled);
    }, HARDWARE_PROBE_DEBOUNCE_MS);
  }

  private async flushHardwareProbe(): Promise<void> {
    while (!this.closed) {
      const generation = this.probeGeneration;
      const input = this.latestProbe;
      const settled = this.probeSettled;
      const resolveSettled = this.resolveProbeSettled;
      if (this.probeTimer != null && input != null) {
        this.clearProbeTimer();
        await this.applyHardwareProbe(input, generation);
        resolveSettled();
      }
      await settled;
      if (
        this.closed ||
        (generation === this.probeGeneration && this.probeTimer == null)
      ) {
        return;
      }
    }
  }

  private async applyHardwareProbe(
    input: THardwareProbeInput,
    generation: number,
  ): Promise<void> {
    const choice = await resolveDefaultVideoCodec({
      available: this.codecs,
      height: input.height,
      fps: input.fps,
      bitrateKbps: streamProbeBitrateKbps({
        height: input.height,
        fps: input.fps,
        contentMode: input.contentMode,
        maxKbps: this.maxBitrateKbps,
        bitrateKbps: this.initialBitrateKbps,
      }),
    });
    if (generation !== this.probeGeneration) {
      return;
    }
    this.hardwareLabel.codec.set(choice.hardwareCodec);
    if (!this.codecLocked) {
      this.codec.set(choice.codec);
    }
  }

  private clearProbeTimer(): void {
    if (this.probeTimer == null) {
      return;
    }
    clearTimeout(this.probeTimer);
    this.probeTimer = undefined;
  }
}
