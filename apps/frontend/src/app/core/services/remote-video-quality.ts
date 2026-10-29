import type { TStreamLayer } from '@konvoez/shared';

export type TViewerQualityMode = 'auto' | TStreamLayer;

type TLayerConsumer = {
  rtpParameters?: {
    encodings?: ReadonlyArray<{ scalabilityMode?: string }>;
  };
};

const SCALABILITY_MODE = /^[LS]([1-9]\d?)T([1-9]\d?)/;

export function getConsumerLayerCount(consumer: TLayerConsumer): number {
  const encodings = consumer.rtpParameters?.encodings;
  if (encodings && encodings.length > 1) {
    return encodings.length;
  }
  const match = SCALABILITY_MODE.exec(encodings?.[0]?.scalabilityMode ?? '');
  return match ? Number(match[1]) : 1;
}

export function resolvePreferredLayer(
  target: TStreamLayer,
  layers: readonly TStreamLayer[],
): number {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (layer && layer.height <= target.height && layer.fps <= target.fps) {
      return index;
    }
  }
  return 0;
}

function layerHeight(layers: readonly TStreamLayer[], index: number): number {
  return layers[index]?.height ?? 0;
}

/** Last layer of the same height. Layers are ordered by height, then fps. */
function highestFpsAtHeight(
  layers: readonly TStreamLayer[],
  index: number,
): number {
  const height = layerHeight(layers, index);
  let chosen = index;
  while (
    chosen + 1 < layers.length &&
    layerHeight(layers, chosen + 1) === height
  ) {
    chosen += 1;
  }
  return chosen;
}

/** Highest-fps layer of the next lower height, or `index` when there is none. */
function lowerHeightIndex(
  layers: readonly TStreamLayer[],
  index: number,
): number {
  const height = layerHeight(layers, index);
  let previous = index - 1;
  while (previous > 0 && layerHeight(layers, previous) === height) {
    previous -= 1;
  }
  if (previous < 0 || layerHeight(layers, previous) >= height) {
    return index;
  }
  return previous;
}

export function pickAutoLayer(input: {
  tilePixelHeight: number;
  layers: readonly TStreamLayer[];
  current?: number;
}): number {
  const { tilePixelHeight, layers } = input;
  const top = Math.max(0, layers.length - 1);
  if (input.current == null) {
    const index = layers.findIndex((layer) => layer.height >= tilePixelHeight);
    return index === -1 ? top : highestFpsAtHeight(layers, index);
  }
  let next = Math.min(Math.max(0, input.current), top);
  while (next < top && tilePixelHeight > layerHeight(layers, next)) {
    next += 1;
  }
  next = highestFpsAtHeight(layers, next);
  while (next > 0) {
    const previous = lowerHeightIndex(layers, next);
    if (
      previous === next ||
      tilePixelHeight > 0.8 * layerHeight(layers, previous)
    ) {
      break;
    }
    next = previous;
  }
  return next;
}
