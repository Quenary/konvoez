import { describe, expect, it } from 'vitest';
import { pickAutoLayer, resolvePreferredLayer } from './remote-video-quality';

const layers = [
  { height: 480, fps: 30 },
  { height: 720, fps: 60 },
  { height: 1080, fps: 60 },
];

describe('remote-video-quality', () => {
  it('resolves an exact layer', () => {
    expect(resolvePreferredLayer({ height: 720, fps: 60 }, layers)).toBe(1);
  });

  it('falls back to a lower fps at the same height, then a lower height', () => {
    expect(resolvePreferredLayer({ height: 1080, fps: 30 }, layers)).toBe(0);
    expect(resolvePreferredLayer({ height: 700, fps: 60 }, layers)).toBe(0);
  });

  it('uses the lowest layer when the target is below every layer', () => {
    expect(resolvePreferredLayer({ height: 160, fps: 15 }, layers)).toBe(0);
  });

  it('picks the lowest layer that covers the tile and keeps hysteresis', () => {
    const layers = [
      { height: 480, fps: 30 },
      { height: 720, fps: 30 },
      { height: 1080, fps: 30 },
    ];
    expect(pickAutoLayer({ tilePixelHeight: 500, layers })).toBe(1);
    expect(pickAutoLayer({ tilePixelHeight: 2000, layers })).toBe(2);
    expect(pickAutoLayer({ tilePixelHeight: 600, layers, current: 1 })).toBe(1);
    expect(pickAutoLayer({ tilePixelHeight: 300, layers, current: 1 })).toBe(0);
    expect(pickAutoLayer({ tilePixelHeight: 800, layers, current: 1 })).toBe(2);
  });

  it('keeps the higher frame rate when two layers share a height', () => {
    const layers = [
      { height: 720, fps: 30 },
      { height: 1080, fps: 30 },
      { height: 1080, fps: 60 },
    ];
    expect(pickAutoLayer({ tilePixelHeight: 900, layers })).toBe(2);
    expect(pickAutoLayer({ tilePixelHeight: 900, layers, current: 1 })).toBe(2);
    expect(pickAutoLayer({ tilePixelHeight: 400, layers, current: 2 })).toBe(0);
    expect(pickAutoLayer({ tilePixelHeight: 700, layers, current: 2 })).toBe(2);
  });
});
