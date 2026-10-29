export type TStreamContentMode = 'detail' | 'motion';

export type TStreamLayer = {
  height: number;
  fps: number;
};

export type TSimulcastLayer = {
  scaleResolutionDownBy: number;
  height: number;
  fps: number;
  maxFramerate: number;
  maxBitrate: number;
};

export type TSimulcastPlanInput = {
  sourceHeight: number;
  layers: TStreamLayer[];
  contentMode: TStreamContentMode;
  maxBitrateBps: number;
};

export const STREAM_LAYER_HEIGHTS = [1080, 720, 480, 360, 160] as const;
export const STREAM_EXTRA_LAYERS_MAX = 2;

/** Streamer bitrate slider lower bound, in kbit/s. */
export const STREAM_BITRATE_SLIDER_MIN_KBPS = 500;
/** Streamer bitrate slider step, in kbit/s. */
export const STREAM_BITRATE_SLIDER_STEP_KBPS = 250;
/** Warning threshold for the streamer bitrate slider, in kbit/s. */
export const STREAM_BITRATE_WARN_KBPS = 15_000;

/** Floor for a non-top simulcast layer, in bits per second. */
export const MIN_LAYER_BITRATE_BPS = 100_000;

const STREAM_BITRATE_BASE_KBPS = [
  { height: 360, kbps: 700 },
  { height: 480, kbps: 1200 },
  { height: 720, kbps: 2500 },
  { height: 1080, kbps: 5000 },
] as const;

function sameLayer(left: TStreamLayer, right: TStreamLayer): boolean {
  return left.height === right.height && left.fps === right.fps;
}

export function streamLayerOptions(max: TStreamLayer): TStreamLayer[] {
  const fpsChoices = [max.fps, 30].filter(
    (fps, index, all) => fps <= max.fps && all.indexOf(fps) === index,
  );
  const options: TStreamLayer[] = [];
  for (const height of STREAM_LAYER_HEIGHTS) {
    if (height > max.height) {
      continue;
    }
    for (const fps of fpsChoices) {
      if (height === max.height && fps === max.fps) {
        continue;
      }
      options.push({ height, fps });
    }
  }
  return options;
}

export function defaultExtraLayers(max: TStreamLayer): TStreamLayer[] {
  const height = STREAM_LAYER_HEIGHTS.find((preset) => preset < max.height);
  if (height == null) {
    return [];
  }
  return [{ height, fps: max.fps }];
}

export function sortStreamLayers(
  layers: readonly TStreamLayer[],
): TStreamLayer[] {
  return [...layers].sort(
    (left, right) => left.height - right.height || left.fps - right.fps,
  );
}

export function formatStreamLayer(layer: TStreamLayer): string {
  return `${layer.height}p${layer.fps}`;
}

export function resolveStreamLayers(input: {
  max: TStreamLayer;
  extra: readonly TStreamLayer[];
  sourceHeight: number;
}): TStreamLayer[] {
  const sourceHeight = Math.max(1, input.sourceHeight);
  const options = streamLayerOptions(input.max);
  const resolvedMax = { height: sourceHeight, fps: input.max.fps };
  const extras: TStreamLayer[] = [];
  for (const layer of input.extra) {
    if (layer.height > sourceHeight || sameLayer(layer, resolvedMax)) {
      continue;
    }
    if (!options.some((option) => sameLayer(option, layer))) {
      continue;
    }
    if (extras.some((existing) => sameLayer(existing, layer))) {
      continue;
    }
    extras.push(layer);
    if (extras.length >= STREAM_EXTRA_LAYERS_MAX) {
      break;
    }
  }
  return sortStreamLayers([resolvedMax, ...extras]);
}

function equalBitrates(budget: number, count: number): number[] {
  const safeBudget = Math.max(0, Math.floor(budget));
  const base = Math.floor(safeBudget / count);
  const bitrates = Array.from({ length: count }, () => base);
  let leftover = safeBudget - base * count;
  for (let index = count - 1; leftover > 0; index -= 1) {
    bitrates[index] += 1;
    leftover -= 1;
  }
  return bitrates;
}

export function computeSimulcastLayers(
  input: TSimulcastPlanInput,
): TSimulcastLayer[] {
  const layers = input.layers;
  const count = layers.length;
  if (count === 0) {
    return [];
  }
  const budget = Math.max(0, Math.floor(input.maxBitrateBps));
  const sourceHeight = Math.max(1, input.sourceHeight);
  const top = layers[count - 1];
  const topHeight = Math.max(1, top?.height ?? sourceHeight);
  const topFps = Math.max(1, top?.fps ?? 1);
  const exponent = input.contentMode === 'motion' ? 0.5 : 0.25;

  const planned = layers.map((layer) => {
    const height = Math.max(1, layer.height);
    const fps = Math.max(1, layer.fps);
    return {
      height,
      fps,
      scaleResolutionDownBy: sourceHeight / height,
      maxFramerate: fps,
    };
  });

  const weights = planned.map(
    (layer) =>
      (layer.height / topHeight) ** 2 * (layer.fps / topFps) ** exponent,
  );
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const shares =
    weightSum > 0
      ? weights.map((weight) => (budget * weight) / weightSum)
      : planned.map(() => budget / count);

  let bitrates: number[];
  if (count === 1) {
    bitrates = [budget];
  } else {
    const nonTop = shares
      .slice(0, -1)
      .map((share) => Math.max(MIN_LAYER_BITRATE_BPS, Math.round(share)));
    const remainder = budget - nonTop.reduce((sum, value) => sum + value, 0);
    if (remainder < MIN_LAYER_BITRATE_BPS) {
      bitrates = equalBitrates(budget, count);
    } else {
      bitrates = [...nonTop, remainder];
    }
  }

  return planned.map((layer, index) => ({
    ...layer,
    maxBitrate: bitrates[index] ?? 0,
  }));
}

function baseBitrateKbps(height: number): number {
  let base: number = STREAM_BITRATE_BASE_KBPS[0].kbps;
  for (const row of STREAM_BITRATE_BASE_KBPS) {
    if (height >= row.height) {
      base = row.kbps;
    }
  }
  return base;
}

function layerBitrateKbps(
  height: number,
  fps: number,
  contentMode: TStreamContentMode,
): number {
  const safeFps = Math.max(1, fps);
  let kbps = baseBitrateKbps(height) * Math.sqrt(safeFps / 30);
  if (contentMode === 'motion') {
    kbps *= 1.25;
  }
  return (
    Math.round(kbps / STREAM_BITRATE_SLIDER_STEP_KBPS) *
    STREAM_BITRATE_SLIDER_STEP_KBPS
  );
}

export function recommendStreamBitrateKbps(input: {
  height: number;
  fps: number;
  contentMode: TStreamContentMode;
  maxKbps: number;
  extra?: readonly TStreamLayer[];
}): number {
  const layers = resolveStreamLayers({
    max: { height: input.height, fps: input.fps },
    extra: input.extra ?? [],
    sourceHeight: input.height,
  });
  const total = layers.reduce(
    (sum, layer) =>
      sum + layerBitrateKbps(layer.height, layer.fps, input.contentMode),
    0,
  );
  const ceiling = Math.max(0, input.maxKbps);
  return Math.min(ceiling, Math.max(STREAM_BITRATE_SLIDER_MIN_KBPS, total));
}
