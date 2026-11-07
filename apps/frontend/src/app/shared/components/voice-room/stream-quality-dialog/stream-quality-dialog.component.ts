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
import { icons } from '@constants';
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
  TuiHint,
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
  cameraInput: MediaDeviceInfo | null;
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
  cameraInput: MediaDeviceInfo | null;
};

type TStreamSelectValue = TStreamHeight | TStreamFps | TStreamVideoCodec;

const CODEC_LABELS: Record<TStreamVideoCodec, string> = {
  h264: 'H.264',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
};

const CONTENT_MODE_LABELS: Record<TStreamContentMode, string> = {
  detail: 'CALL.STREAM_CONTENT_TEXT',
  motion: 'CALL.STREAM_CONTENT_GAME',
};

const SVC_MODE_LABELS: Record<TStreamSvcMode, string> = {
  L1T3: 'CALL.STREAM_SVC_L1',
  L2T3_KEY: 'CALL.STREAM_SVC_L2',
  L3T3_KEY: 'CALL.STREAM_SVC_L3',
};

function isSvcMode(value: string): value is TStreamSvcMode {
  return (STREAM_SVC_MODES as readonly string[]).includes(value);
}

function storedCodec(
  codec: TStreamVideoCodec | null | undefined,
  codecs: readonly TStreamVideoCodec[],
): TStreamVideoCodec | null {
  if (codec && codecs.includes(codec)) {
    return codec;
  }
  return null;
}

function fallbackCodec(
  codecs: readonly TStreamVideoCodec[],
): TStreamVideoCodec {
  return pickDefaultVideoCodec({
    available: codecs,
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
  readonly defaultCodec = signal<TStreamVideoCodec | null>(null);
}

function isDefaultSelectItem(
  item: TStreamSelectValue | TStreamSvcMode | TStreamContentMode,
  defaultCodec: TStreamVideoCodec | null,
): boolean {
  if (typeof item === 'number') {
    return (STREAM_HEIGHTS as readonly number[]).includes(item)
      ? item === DEFAULT_STREAM_HEIGHT
      : item === DEFAULT_STREAM_FPS;
  }
  if (isSvcMode(item)) {
    return item === DEFAULT_STREAM_SVC_MODE;
  }
  if (item === 'detail' || item === 'motion') {
    return item === DEFAULT_SCREEN_CONTENT_MODE;
  }
  return item === defaultCodec;
}

function stringifyStreamSelectItem(
  item:
    TStreamSelectValue | TStreamSvcMode | TStreamContentMode | null | undefined,
  translate: (key: string) => string,
): string {
  if (item == null) {
    return '';
  }
  if (typeof item === 'string') {
    if (isSvcMode(item)) {
      return translate(SVC_MODE_LABELS[item]);
    }
    if (item === 'detail' || item === 'motion') {
      return translate(CONTENT_MODE_LABELS[item]);
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
    TuiHint,
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
            (
              item:
                | TStreamSelectValue
                | TStreamSvcMode
                | TStreamContentMode
                | null
                | undefined,
            ) => {
              const hardwareCodec = hardwareLabel.codec();
              const defaultCodec = hardwareLabel.defaultCodec();
              let label = stringifyStreamSelectItem(item, (key) =>
                translateService.instant(key),
              );
              if (item != null && item === hardwareCodec) {
                label = `${label} (${translateService.instant('CALL.STREAM_CODEC_HARDWARE')})`;
              }
              if (item != null && isDefaultSelectItem(item, defaultCodec)) {
                label = translateService.instant('CALL.STREAM_DEFAULT_VALUE', {
                  value: label,
                });
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
  private readonly translateService = inject(TranslateService);

  protected readonly icons = icons;
  protected readonly heights = [...STREAM_HEIGHTS];
  protected readonly fpsOptions = [...STREAM_FPS_OPTIONS];
  protected readonly contentModes = CONTENT_MODES;
  protected readonly svcModes = [...STREAM_SVC_MODES];
  protected readonly bitrateMinKbps = STREAM_BITRATE_SLIDER_MIN_KBPS;
  protected readonly bitrateStepKbps = STREAM_BITRATE_SLIDER_STEP_KBPS;

  protected readonly confirmKey = computed(() =>
    this.context.data?.kind === 'screen' ? 'GENERAL.NEXT' : 'CALL.START_CAMERA',
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
    storedCodec(this.context.data?.codec, this.codecs) ??
      fallbackCodec(this.codecs),
  );
  protected readonly probedCodec = signal<TStreamVideoCodec>(
    fallbackCodec(this.codecs),
  );
  private codecLocked =
    storedCodec(this.context.data?.codec, this.codecs) != null;
  private readonly formReset = signal(0);
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
    (this.context.data?.extraLayers?.length ?? 0) > 0;
  private readonly keepStoredBitrate =
    this.initialBitrateKbps != null &&
    !this.dropsStoredLayers &&
    (this.context.data?.codec === this.codec() ||
      (this.context.data?.codec != null &&
        streamSupportsSimulcast(this.context.data.codec) &&
        streamSupportsSimulcast(this.codec())));
  protected readonly maxBitrateKbps =
    this.context.data?.maxBitrateKbps ?? DEFAULT_STREAM_MAX_BITRATE_KBPS;

  protected readonly effectiveContentMode = computed(() =>
    this.isScreen() ? this.contentMode() : ('motion' as const),
  );

  protected readonly extraLayers = linkedSignal<
    {
      height: TStreamHeight;
      fps: TStreamFps;
      simulcast: boolean;
      reset: number;
    },
    TStreamLayer[]
  >({
    source: () => ({
      height: this.height(),
      fps: this.fps(),
      simulcast: streamSupportsSimulcast(this.codec()),
      reset: this.formReset(),
    }),
    computation: (source, previous) => {
      const defaults = defaultExtraLayers(source);
      if (!previous) {
        const stored = this.context.data?.extraLayers ?? null;
        if (!source.simulcast) {
          return stored ?? [];
        }
        if (stored == null) {
          return defaults;
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
      }
      if (
        source.reset !== previous.source.reset ||
        source.height !== previous.source.height ||
        source.fps !== previous.source.fps ||
        source.simulcast !== previous.source.simulcast
      ) {
        return source.simulcast ? defaults : [];
      }
      return previous.value;
    },
  });

  protected readonly effectiveExtraLayers = computed(() => {
    const extra = this.extraLayers();
    const simulcast = streamSupportsSimulcast(this.codec());
    return simulcast ? extra : [];
  });

  protected readonly layerOptions = computed(() =>
    streamLayerOptions({
      height: this.height(),
      fps: this.fps(),
    }),
  );

  protected readonly simulcastSupported = computed(() =>
    streamSupportsSimulcast(this.codec()),
  );

  protected readonly svcMode = linkedSignal<
    { svc: boolean; reset: number },
    TStreamSvcMode
  >({
    source: () => ({
      svc: streamSupportsSvc(this.codec()),
      reset: this.formReset(),
    }),
    computation: (source, previous) => {
      if (!previous) {
        return this.context.data?.svcMode ?? DEFAULT_STREAM_SVC_MODE;
      }
      if (
        source.reset !== previous.source.reset ||
        source.svc !== previous.source.svc
      ) {
        return DEFAULT_STREAM_SVC_MODE;
      }
      return previous.value;
    },
  });

  protected readonly effectiveSvcMode = computed(() => {
    const codec = this.codec();
    const svcMode = this.svcMode();
    if (!streamSupportsSvc(codec)) {
      return null;
    }
    return svcMode;
  });

  protected readonly stringifyLayer = (layer: TStreamLayer): string => {
    const label = formatStreamLayer(layer);
    const isDefault = defaultExtraLayers({
      height: this.height(),
      fps: this.fps(),
    }).some((item) => item.height === layer.height && item.fps === layer.fps);
    if (!isDefault) {
      return label;
    }
    return this.translateService.instant('CALL.STREAM_DEFAULT_VALUE', {
      value: label,
    });
  };

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
      svcMode: TStreamSvcMode | null;
    },
    number
  >({
    source: () => ({
      height: this.height(),
      fps: this.fps(),
      contentMode: this.effectiveContentMode(),
      extra: this.effectiveExtraLayers(),
      codec: this.codec(),
      svcMode: this.effectiveSvcMode(),
    }),
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
      return this.recommendedBitrate(source);
    },
  });

  protected readonly showBitrateWarning = computed(
    () => this.bitrateKbps() > STREAM_BITRATE_WARN_KBPS,
  );
  protected readonly storedCameraInput = this.context.data?.cameraInput ?? null;
  protected readonly selectedCamera = signal<MediaDeviceInfo | null>(null);
  protected readonly previewBlocked = signal(true);
  protected readonly confirmDisabled = computed(() => {
    const screen = this.isScreen();
    const blocked = this.previewBlocked();
    return !screen && blocked;
  });

  constructor() {
    this.hardwareLabel.defaultCodec.set(this.probedCodec());
    this.destroyRef.onDestroy(() => {
      this.closed = true;
      this.probeGeneration += 1;
      this.clearProbeTimer();
      this.resolveProbeSettled();
    });
    effect(() => {
      const height = this.height();
      const fps = this.fps();
      const contentMode = this.effectiveContentMode();
      this.scheduleHardwareProbe({ height, fps, contentMode });
    });
  }

  protected onCodecChange(codec: TStreamVideoCodec | null): void {
    if (codec == null) {
      return;
    }
    this.codecLocked = true;
    this.codec.set(codec);
  }

  protected onExtraLayersChange(layers: readonly TStreamLayer[] | null): void {
    this.extraLayers.set((layers ?? []).slice(0, STREAM_EXTRA_LAYERS_MAX));
  }

  protected onReset(): void {
    this.codecLocked = false;
    this.height.set(DEFAULT_STREAM_HEIGHT);
    this.fps.set(DEFAULT_STREAM_FPS);
    this.contentMode.set(DEFAULT_SCREEN_CONTENT_MODE);
    this.codec.set(this.probedCodec());
    this.formReset.update((value) => value + 1);
    const codec = this.probedCodec();
    this.bitrateKbps.set(
      this.recommendedBitrate({
        height: DEFAULT_STREAM_HEIGHT,
        fps: DEFAULT_STREAM_FPS,
        contentMode: this.effectiveContentMode(),
        extra: streamSupportsSimulcast(codec)
          ? defaultExtraLayers({
              height: DEFAULT_STREAM_HEIGHT,
              fps: DEFAULT_STREAM_FPS,
            })
          : [],
        codec,
        svcMode: streamSupportsSvc(codec) ? DEFAULT_STREAM_SVC_MODE : null,
      }),
    );
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
      const screen = this.isScreen();
      const cameraInput = screen ? null : this.selectedCamera();
      this.context.completeWith({
        height: this.height(),
        fps: this.fps(),
        extraLayers: this.extraLayers(),
        svcMode: this.svcMode(),
        bitrateKbps: this.confirmedBitrateKbps(),
        codec: this.codec(),
        cameraInput,
        ...(screen ? { contentMode: this.contentMode() } : {}),
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
    this.hardwareLabel.defaultCodec.set(choice.codec);
    this.probedCodec.set(choice.codec);
    if (!this.codecLocked) {
      this.codec.set(choice.codec);
    }
  }

  private recommendedBitrate(source: {
    height: TStreamHeight;
    fps: TStreamFps;
    contentMode: TStreamContentMode;
    extra: TStreamLayer[];
    codec: TStreamVideoCodec;
    svcMode: TStreamSvcMode | null;
  }): number {
    return recommendStreamBitrateKbps({
      height: source.height,
      fps: source.fps,
      contentMode: source.contentMode,
      maxKbps: this.maxBitrateKbps,
      extra: source.extra,
      codec: source.codec,
      svcMode: source.svcMode ?? undefined,
    });
  }

  private confirmedBitrateKbps(): number {
    return Math.min(
      this.maxBitrateKbps,
      Math.max(STREAM_BITRATE_SLIDER_MIN_KBPS, this.bitrateKbps()),
    );
  }

  private clearProbeTimer(): void {
    if (this.probeTimer == null) {
      return;
    }
    clearTimeout(this.probeTimer);
    this.probeTimer = undefined;
  }
}
