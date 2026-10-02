import { computeMediaGridLayout, mediaFrameLimit } from './media-grid.layout';

describe('computeMediaGridLayout', () => {
  function spans(count: number): number[] {
    return computeMediaGridLayout(count).cells.map((cell) => cell.colSpan);
  }

  it('clamps a single image aspect', () => {
    expect(
      computeMediaGridLayout(1, { width: 1, height: 10 }).singleAspect,
    ).toBe(0.5);
    expect(
      computeMediaGridLayout(1, { width: 10, height: 1 }).singleAspect,
    ).toBe(2);
    expect(computeMediaGridLayout(1).singleAspect).toBeCloseTo(4 / 3);
  });

  it('stacks two items', () => {
    expect(spans(2)).toEqual([6, 6]);
  });

  it('caps a single image at its source width', () => {
    expect(mediaFrameLimit([{ width: 400, height: 400 }])).toEqual({
      width: 400,
      heightFactor: 1,
    });
  });

  it('caps a row so no tile is wider than its source', () => {
    expect(
      mediaFrameLimit([
        { width: 800, height: 800 },
        { width: 200, height: 200 },
        { width: 200, height: 200 },
      ]),
    ).toEqual({
      width: 400,
      heightFactor: 1,
    });
  });

  it('returns null when a size is missing', () => {
    expect(mediaFrameLimit([])).toBeNull();
    expect(mediaFrameLimit([{ width: 0, height: 10 }])).toBeNull();
  });

  it('lays out 3, 4, 5, 7 and 10', () => {
    expect(spans(3)).toEqual([6, 3, 3]);
    expect(spans(4)).toEqual([3, 3, 3, 3]);
    expect(spans(5)).toEqual([3, 3, 2, 2, 2]);
    expect(spans(7)).toEqual([6, 2, 2, 2, 2, 2, 2]);
    expect(spans(10)).toEqual([6, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  });
});
