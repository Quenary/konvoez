export type TStreamContentMode = 'detail' | 'motion';

export type TSimulcastLayer = {
  scaleResolutionDownBy: number;
  height: number;
  maxFramerate: number;
  maxBitrate: number;
};

export type TSimulcastPlanInput = {
  height: number;
  fps: number;
  contentMode: TStreamContentMode;
  layers: number;
  maxBitrateBps: number;
};

export const STREAM_LAYER_COUNT_MIN = 1;
export const STREAM_LAYER_COUNT_MAX = 3;
export const DEFAULT_STREAM_LAYERS = 2;

/** Streamer bitrate slider lower bound, in kbit/s. */
export const STREAM_BITRATE_SLIDER_MIN_KBPS = 500;
/** Streamer bitrate slider step, in kbit/s. */
export const STREAM_BITRATE_SLIDER_STEP_KBPS = 250;
/** Warning threshold for the streamer bitrate slider, in kbit/s. */
export const STREAM_BITRATE_WARN_KBPS = 15_000;

/** Floor for a non-top simulcast layer, in bits per second. */
export const MIN_LAYER_BITRATE_BPS = 100_000;

const LOWEST_LAYER_MIN_HEIGHT = 180;
const HEIGHT_FOR_TWO_LAYERS = LOWEST_LAYER_MIN_HEIGHT * 2;
const HEIGHT_FOR_THREE_LAYERS = LOWEST_LAYER_MIN_HEIGHT * 4;

const STREAM_BITRATE_BASE_KBPS = [
  { height: 360, kbps: 700 },
  { height: 480, kbps: 1200 },
  { height: 720, kbps: 2500 },
  { height: 1080, kbps: 5000 },
] as const;

export function maxStreamLayersForHeight(height: number): number {
  if (height >= HEIGHT_FOR_THREE_LAYERS) {
    return STREAM_LAYER_COUNT_MAX;
  }
  if (height >= HEIGHT_FOR_TWO_LAYERS) {
    return 2;
  }
  return STREAM_LAYER_COUNT_MIN;
}

export function clampStreamLayers(layers: number, height: number): number {
  const max = maxStreamLayersForHeight(height);
  const rounded = Number.isFinite(layers)
    ? Math.round(layers)
    : STREAM_LAYER_COUNT_MIN;
  return Math.min(
    max,
    Math.max(STREAM_LAYER_COUNT_MIN, Math.min(STREAM_LAYER_COUNT_MAX, rounded)),
  );
}

function layerFramerate(
  fps: number,
  scale: number,
  contentMode: TStreamContentMode,
  isTop: boolean,
): number {
  if (isTop) {
    return fps;
  }
  if (contentMode === 'motion') {
    return Math.min(fps, 30);
  }
  if (scale >= 4) {
    return Math.min(fps, 10);
  }
  return Math.min(fps, 15);
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
  const count = clampStreamLayers(input.layers, input.height);
  const budget = Math.max(0, Math.floor(input.maxBitrateBps));
  const sourceHeight = Math.max(1, input.height);
  const fps = Math.max(1, input.fps);

  const planned = Array.from({ length: count }, (_, index) => {
    const scaleResolutionDownBy = 2 ** (count - 1 - index);
    const height = Math.round(sourceHeight / scaleResolutionDownBy);
    const maxFramerate = layerFramerate(
      fps,
      scaleResolutionDownBy,
      input.contentMode,
      index === count - 1,
    );
    return { scaleResolutionDownBy, height, maxFramerate };
  });

  const weights = planned.map(
    (layer) =>
      (layer.height / sourceHeight) ** 2 * Math.sqrt(layer.maxFramerate / fps),
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

export function recommendStreamBitrateKbps(input: {
  height: number;
  fps: number;
  contentMode: TStreamContentMode;
  maxKbps: number;
}): number {
  const fps = Math.max(1, input.fps);
  let kbps = baseBitrateKbps(input.height) * Math.sqrt(fps / 30);
  if (input.contentMode === 'motion') {
    kbps *= 1.25;
  }
  const rounded =
    Math.round(kbps / STREAM_BITRATE_SLIDER_STEP_KBPS) *
    STREAM_BITRATE_SLIDER_STEP_KBPS;
  const ceiling = Math.max(0, input.maxKbps);
  return Math.min(ceiling, Math.max(STREAM_BITRATE_SLIDER_MIN_KBPS, rounded));
}
