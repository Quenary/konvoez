export type TViewerQualityMode = 'auto' | 'low' | 'medium' | 'high' | 'source';

export const VIEWER_QUALITY_MODES = [
  { mode: 'auto', labelKey: 'CALL.VIEW_QUALITY_AUTO' },
  { mode: 'low', labelKey: 'CALL.VIEW_QUALITY_LOW' },
  { mode: 'medium', labelKey: 'CALL.VIEW_QUALITY_MEDIUM' },
  { mode: 'high', labelKey: 'CALL.VIEW_QUALITY_HIGH' },
  { mode: 'source', labelKey: 'CALL.VIEW_QUALITY_SOURCE' },
] as const satisfies ReadonlyArray<{
  mode: TViewerQualityMode;
  labelKey: string;
}>;

const FIXED_CAPS = {
  low: 360,
  medium: 720,
  high: 1080,
} as const;

type TLayerConsumer = {
  rtpParameters?: {
    encodings?: ReadonlyArray<{ scalabilityMode?: string }>;
  };
};

export function getLayerHeights(
  sourceHeight: number,
  layerCount: number,
): number[] {
  return Array.from({ length: layerCount }, (_, index) =>
    Math.round(sourceHeight / 2 ** (layerCount - 1 - index)),
  );
}

const SCALABILITY_MODE = /^[LS]([1-9]\d?)T([1-9]\d?)/;

export function getConsumerLayerCount(consumer: TLayerConsumer): number {
  const match = SCALABILITY_MODE.exec(
    consumer.rtpParameters?.encodings?.[0]?.scalabilityMode ?? '',
  );
  return match ? Number(match[1]) : 1;
}

export function pickFixedLayer(
  mode: Exclude<TViewerQualityMode, 'auto'>,
  layerHeights: readonly number[],
): number {
  if (mode === 'source' || layerHeights.length === 0) {
    return Math.max(0, layerHeights.length - 1);
  }
  const cap = FIXED_CAPS[mode];
  let chosen = 0;
  layerHeights.forEach((height, index) => {
    if (height <= cap) {
      chosen = index;
    }
  });
  return chosen;
}

export function pickAutoLayer(input: {
  tilePixelHeight: number;
  layerHeights: readonly number[];
  current?: number;
}): number {
  const { tilePixelHeight, layerHeights } = input;
  const top = Math.max(0, layerHeights.length - 1);
  if (input.current == null) {
    const index = layerHeights.findIndex((height) => height >= tilePixelHeight);
    return index === -1 ? top : index;
  }
  let next = Math.min(Math.max(0, input.current), top);
  while (next < top && tilePixelHeight > (layerHeights[next] ?? 0)) {
    next += 1;
  }
  while (next > 0 && tilePixelHeight <= 0.8 * (layerHeights[next - 1] ?? 0)) {
    next -= 1;
  }
  return next;
}
