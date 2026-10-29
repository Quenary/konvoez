import { describe, expect, it } from 'vitest';
import {
  computeSimulcastLayers,
  defaultExtraLayers,
  formatStreamLayer,
  MIN_LAYER_BITRATE_BPS,
  recommendStreamBitrateKbps,
  resolveStreamLayers,
  sortStreamLayers,
  STREAM_BITRATE_SLIDER_MIN_KBPS,
  streamLayerOptions,
} from './stream-layers';

describe('stream-layers', () => {
  describe('streamLayerOptions', () => {
    it('lists 1080p60 options high to low, excluding the max', () => {
      expect(streamLayerOptions({ height: 1080, fps: 60 })).toEqual([
        { height: 1080, fps: 30 },
        { height: 720, fps: 60 },
        { height: 720, fps: 30 },
        { height: 480, fps: 60 },
        { height: 480, fps: 30 },
        { height: 360, fps: 60 },
        { height: 360, fps: 30 },
        { height: 160, fps: 60 },
        { height: 160, fps: 30 },
      ]);
    });

    it('lists only 30 fps options at or below 720p30', () => {
      expect(streamLayerOptions({ height: 720, fps: 30 })).toEqual([
        { height: 480, fps: 30 },
        { height: 360, fps: 30 },
        { height: 160, fps: 30 },
      ]);
    });

    it('lists only 160p15 below 360p15', () => {
      expect(streamLayerOptions({ height: 360, fps: 15 })).toEqual([
        { height: 160, fps: 15 },
      ]);
    });
  });

  describe('defaultExtraLayers', () => {
    it.each([
      [{ height: 1080, fps: 60 }, [{ height: 720, fps: 60 }]],
      [{ height: 1080, fps: 30 }, [{ height: 720, fps: 30 }]],
      [{ height: 720, fps: 60 }, [{ height: 480, fps: 60 }]],
      [{ height: 720, fps: 15 }, [{ height: 480, fps: 15 }]],
      [{ height: 480, fps: 30 }, [{ height: 360, fps: 30 }]],
      [{ height: 360, fps: 15 }, [{ height: 160, fps: 15 }]],
      [{ height: 160, fps: 30 }, []],
    ])('default for %j is %j', (max, expected) => {
      expect(defaultExtraLayers(max)).toEqual(expected);
    });
  });

  describe('sortStreamLayers and formatStreamLayer', () => {
    it('sorts low to high and formats 720p30', () => {
      expect(
        sortStreamLayers([
          { height: 1080, fps: 60 },
          { height: 1080, fps: 30 },
          { height: 720, fps: 60 },
        ]),
      ).toEqual([
        { height: 720, fps: 60 },
        { height: 1080, fps: 30 },
        { height: 1080, fps: 60 },
      ]);
      expect(formatStreamLayer({ height: 720, fps: 30 })).toBe('720p30');
    });
  });

  describe('resolveStreamLayers', () => {
    it('drops layers above the capture height and invalid entries, then sorts', () => {
      expect(
        resolveStreamLayers({
          max: { height: 1080, fps: 60 },
          extra: [
            { height: 720, fps: 60 },
            { height: 999, fps: 30 },
            { height: 480, fps: 30 },
            { height: 480, fps: 30 },
            { height: 360, fps: 30 },
            { height: 160, fps: 30 },
          ],
          sourceHeight: 700,
        }),
      ).toEqual([
        { height: 360, fps: 30 },
        { height: 480, fps: 30 },
        { height: 700, fps: 60 },
      ]);
    });

    it('keeps a same-height lower fps layer', () => {
      expect(
        resolveStreamLayers({
          max: { height: 1080, fps: 60 },
          extra: [{ height: 1080, fps: 30 }],
          sourceHeight: 1080,
        }),
      ).toEqual([
        { height: 1080, fps: 30 },
        { height: 1080, fps: 60 },
      ]);
    });
  });

  describe('computeSimulcastLayers', () => {
    it.each([1, 2, 3])(
      'keeps the bitrate sum within budget for %i layers',
      (count) => {
        const presets = [
          { height: 360, fps: 30 },
          { height: 720, fps: 30 },
          { height: 1080, fps: 30 },
        ];
        const layers = presets.slice(3 - count);
        const budget = 2_500_000;
        const plan = computeSimulcastLayers({
          sourceHeight: 1080,
          layers,
          contentMode: 'motion',
          maxBitrateBps: budget,
        });
        expect(plan).toHaveLength(count);
        const sum = plan.reduce((total, layer) => total + layer.maxBitrate, 0);
        expect(sum).toBeLessThanOrEqual(budget);
        expect(sum).toBe(budget);
        for (const layer of plan.slice(0, -1)) {
          expect(layer.maxBitrate).toBeGreaterThanOrEqual(
            MIN_LAYER_BITRATE_BPS,
          );
        }
      },
    );

    it('splits a tiny budget equally', () => {
      const budget = 150_000;
      const plan = computeSimulcastLayers({
        sourceHeight: 1080,
        layers: [
          { height: 360, fps: 30 },
          { height: 720, fps: 30 },
          { height: 1080, fps: 30 },
        ],
        contentMode: 'motion',
        maxBitrateBps: budget,
      });
      const sum = plan.reduce((total, layer) => total + layer.maxBitrate, 0);
      expect(sum).toBe(budget);
      expect(new Set(plan.map((layer) => layer.maxBitrate)).size).toBe(1);
    });

    it('uses a non-integer scale from 1080 to 720', () => {
      const plan = computeSimulcastLayers({
        sourceHeight: 1080,
        layers: [
          { height: 720, fps: 60 },
          { height: 1080, fps: 60 },
        ],
        contentMode: 'motion',
        maxBitrateBps: 8_000_000,
      });
      expect(plan[0]?.scaleResolutionDownBy).toBe(1.5);
      expect(plan[1]?.scaleResolutionDownBy).toBe(1);
      expect(plan[0]?.maxFramerate).toBe(60);
      expect(plan[1]?.maxFramerate).toBe(60);
    });

    it('gives equal heights scale 1 and orders the lower fps first', () => {
      const plan = computeSimulcastLayers({
        sourceHeight: 1080,
        layers: [
          { height: 1080, fps: 30 },
          { height: 1080, fps: 60 },
        ],
        contentMode: 'detail',
        maxBitrateBps: 8_000_000,
      });
      expect(plan.map((layer) => layer.fps)).toEqual([30, 60]);
      expect(plan.every((layer) => layer.scaleResolutionDownBy === 1)).toBe(
        true,
      );
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

    it('sums the published layers and clamps the total', () => {
      const alone = recommendStreamBitrateKbps({
        height: 1080,
        fps: 60,
        contentMode: 'motion',
        maxKbps: 100_000,
      });
      expect(alone).toBe(8750);
      expect(
        recommendStreamBitrateKbps({
          height: 1080,
          fps: 60,
          contentMode: 'motion',
          maxKbps: 100_000,
          extra: [{ height: 1080, fps: 30 }],
        }),
      ).toBe(15_000);
      expect(
        recommendStreamBitrateKbps({
          height: 1080,
          fps: 60,
          contentMode: 'motion',
          maxKbps: 10_000,
          extra: [{ height: 1080, fps: 30 }],
        }),
      ).toBe(10_000);
      expect(
        recommendStreamBitrateKbps({
          height: 1080,
          fps: 60,
          contentMode: 'motion',
          maxKbps: 100_000,
          extra: [{ height: 999, fps: 30 }],
        }),
      ).toBe(alone);
    });
  });
});
