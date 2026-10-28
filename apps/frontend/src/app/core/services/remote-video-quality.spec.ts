import { describe, expect, it } from 'vitest';
import {
  getLayerHeights,
  pickAutoLayer,
  pickFixedLayer,
  TViewerQualityMode,
} from './remote-video-quality';

const heightsFor = (source: number, layers: number) =>
  getLayerHeights(source, layers);

describe('remote-video-quality', () => {
  it('builds layer heights low to high', () => {
    expect(heightsFor(1080, 3)).toEqual([270, 540, 1080]);
    expect(heightsFor(720, 2)).toEqual([360, 720]);
    expect(heightsFor(360, 1)).toEqual([360]);
  });

  it.each([
    ['low', [270, 540, 1080], 0],
    ['medium', [270, 540, 1080], 1],
    ['high', [270, 540, 1080], 2],
    ['source', [270, 540, 1080], 2],
    ['low', [360], 0],
    ['high', [720, 1440], 0],
  ] as const)('%s picks layer %i', (mode, heights, expected) => {
    expect(
      pickFixedLayer(mode as Exclude<TViewerQualityMode, 'auto'>, heights),
    ).toBe(expected);
  });

  it('picks the lowest layer that covers the tile and keeps hysteresis', () => {
    const layerHeights = [270, 540, 1080];
    expect(pickAutoLayer({ tilePixelHeight: 400, layerHeights })).toBe(1);
    expect(pickAutoLayer({ tilePixelHeight: 2000, layerHeights })).toBe(2);
    expect(
      pickAutoLayer({ tilePixelHeight: 500, layerHeights, current: 1 }),
    ).toBe(1);
    expect(
      pickAutoLayer({ tilePixelHeight: 200, layerHeights, current: 1 }),
    ).toBe(0);
    expect(
      pickAutoLayer({ tilePixelHeight: 600, layerHeights, current: 1 }),
    ).toBe(2);
  });
});
