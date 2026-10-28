import { describe, expect, it } from 'vitest';
import {
  clampStreamLayers,
  computeSimulcastLayers,
  maxStreamLayersForHeight,
  MIN_LAYER_BITRATE_BPS,
  recommendStreamBitrateKbps,
  STREAM_BITRATE_SLIDER_MIN_KBPS,
  TStreamContentMode,
} from './stream-layers';

describe('stream-layers', () => {
  describe('maxStreamLayersForHeight', () => {
    it.each([
      [180, 1],
      [359, 1],
      [360, 2],
      [719, 2],
      [720, 3],
      [1080, 3],
    ])('height %i allows %i layers', (height, layers) => {
      expect(maxStreamLayersForHeight(height)).toBe(layers);
    });
  });

  describe('clampStreamLayers', () => {
    it.each([
      [3, 360, 2],
      [3, 720, 3],
      [1, 1080, 1],
      [2, 200, 1],
      [9, 1080, 3],
    ])('clamps %i layers at height %i to %i', (layers, height, expected) => {
      expect(clampStreamLayers(layers, height)).toBe(expected);
    });
  });

  describe('computeSimulcastLayers', () => {
    const heights = [360, 720, 1080] as const;

    it.each(heights)('plans %i layers worth of scales at %ip', (height) => {
      const maxLayers = maxStreamLayersForHeight(height);
      for (let layers = 1; layers <= maxLayers; layers += 1) {
        const plan = computeSimulcastLayers({
          height,
          fps: 30,
          contentMode: 'motion',
          layers,
          maxBitrateBps: 2_500_000,
        });
        expect(plan).toHaveLength(layers);
        expect(plan[0]?.scaleResolutionDownBy).toBe(2 ** (layers - 1));
        expect(plan[layers - 1]?.scaleResolutionDownBy).toBe(1);
        expect(plan[layers - 1]?.height).toBe(height);
        const sum = plan.reduce((total, layer) => total + layer.maxBitrate, 0);
        expect(sum).toBeLessThanOrEqual(2_500_000);
        for (const layer of plan.slice(0, -1)) {
          expect(layer.maxBitrate).toBeGreaterThanOrEqual(
            MIN_LAYER_BITRATE_BPS,
          );
        }
      }
    });

    it.each([
      ['motion', 4, 30],
      ['motion', 2, 30],
      ['detail', 4, 10],
      ['detail', 2, 15],
    ] as const)(
      '%s scale %i uses %i fps when the source is 60',
      (contentMode: TStreamContentMode, scale, fps) => {
        const plan = computeSimulcastLayers({
          height: 1080,
          fps: 60,
          contentMode,
          layers: 3,
          maxBitrateBps: 5_000_000,
        });
        const layer = plan.find((item) => item.scaleResolutionDownBy === scale);
        expect(layer?.maxFramerate).toBe(fps);
        expect(plan[2]?.maxFramerate).toBe(60);
      },
    );

    it('gives the top layer the source fps', () => {
      const plan = computeSimulcastLayers({
        height: 720,
        fps: 15,
        contentMode: 'detail',
        layers: 2,
        maxBitrateBps: 1_000_000,
      });
      expect(plan[1]?.maxFramerate).toBe(15);
      expect(plan[0]?.maxFramerate).toBe(15);
    });

    it('splits a tiny budget equally', () => {
      const budget = 150_000;
      const plan = computeSimulcastLayers({
        height: 1080,
        fps: 30,
        contentMode: 'motion',
        layers: 3,
        maxBitrateBps: budget,
      });
      const sum = plan.reduce((total, layer) => total + layer.maxBitrate, 0);
      expect(sum).toBe(budget);
      expect(new Set(plan.map((layer) => layer.maxBitrate)).size).toBe(1);
    });

    it('keeps a single layer inside the budget', () => {
      const plan = computeSimulcastLayers({
        height: 720,
        fps: 30,
        contentMode: 'motion',
        layers: 1,
        maxBitrateBps: 800_000,
      });
      expect(plan).toEqual([
        {
          scaleResolutionDownBy: 1,
          height: 720,
          maxFramerate: 30,
          maxBitrate: 800_000,
        },
      ]);
    });
  });

  describe('recommendStreamBitrateKbps', () => {
    it('is monotonic in height and clamps to the slider bounds', () => {
      const heights = [360, 480, 720, 1080];
      const values = heights.map((height) =>
        recommendStreamBitrateKbps({
          height,
          fps: 30,
          contentMode: 'detail',
          maxKbps: 100_000,
        }),
      );
      for (let index = 1; index < values.length; index += 1) {
        expect(values[index]).toBeGreaterThanOrEqual(values[index - 1] ?? 0);
      }
      expect(
        recommendStreamBitrateKbps({
          height: 1080,
          fps: 60,
          contentMode: 'motion',
          maxKbps: 1000,
        }),
      ).toBe(1000);
      expect(
        recommendStreamBitrateKbps({
          height: 360,
          fps: 15,
          contentMode: 'detail',
          maxKbps: 100_000,
        }),
      ).toBeGreaterThanOrEqual(STREAM_BITRATE_SLIDER_MIN_KBPS);
    });
  });
});
